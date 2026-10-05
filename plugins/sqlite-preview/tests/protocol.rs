use rusqlite::Connection;
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

struct Plugin {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    next: u32,
}
impl Plugin {
    fn start() -> Self {
        let executable = std::env::var_os("SQLITE_PREVIEW_PACKAGE_BIN")
            .unwrap_or_else(|| env!("CARGO_BIN_EXE_sqlite-preview").into());
        let mut child = Command::new(executable)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let input = child.stdin.take().unwrap();
        let output = BufReader::new(child.stdout.take().unwrap());
        let mut plugin = Self {
            child,
            input,
            output,
            next: 0,
        };
        assert_eq!(
            plugin.call(json!({"type":"activate"}))["value"],
            json!({"ready":true})
        );
        plugin
    }
    fn call(&mut self, kind: Value) -> Value {
        self.next += 1;
        let id = self.next.to_string();
        writeln!(
            self.input,
            "{}",
            json!({"protocolVersion":1,"payload":{"requestId":id,"kind":kind}})
        )
        .unwrap();
        self.input.flush().unwrap();
        let mut line = String::new();
        self.output.read_line(&mut line).unwrap();
        let response: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(response["requestId"], id);
        response["payload"]["result"].clone()
    }
    fn preview(&mut self, path: &std::path::Path, table: Option<&str>, page: u32) -> Value {
        self.call(json!({"type":"dispatchCommand","command":"preview.render","args":{"path":path,"page":page,"table":table}}))
    }
}
impl Drop for Plugin {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn packaged_preview_reads_typed_pages_without_writes_or_arbitrary_sql() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("sample.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch("CREATE TABLE records(id INTEGER PRIMARY KEY, name TEXT, value, bytes BLOB); CREATE TABLE empty_table(x TEXT); CREATE VIEW hidden_view AS SELECT * FROM records; CREATE TABLE \"quoted\"\"table\"(value TEXT); INSERT INTO \"quoted\"\"table\" VALUES('safe');").unwrap();
    for id in 0..53 {
        db.execute(
            "INSERT INTO records VALUES(?1, ?2, ?3, X'00FF')",
            rusqlite::params![
                id,
                format!("row-{id}"),
                if id == 0 { None } else { Some(1.25) }
            ],
        )
        .unwrap();
    }
    db.execute("UPDATE records SET name=?1 WHERE id=52", ["界".repeat(300)])
        .unwrap();
    drop(db);
    let original = std::fs::read(&path).unwrap();
    let mut plugin = Plugin::start();
    let first = plugin.preview(&path, Some("records"), 0);
    assert_eq!(first["status"], "ok");
    assert_eq!(
        first["value"]["tables"],
        json!(["empty_table", "quoted\"table", "records"])
    );
    assert_eq!(
        first["value"]["columns"],
        json!(["id", "name", "value", "bytes"])
    );
    assert_eq!(
        first["value"]["rows"][0],
        json!(["0", "row-0", null, "0x00FF"])
    );
    assert_eq!(
        first["value"]["rows"][49],
        json!(["49", "row-49", "1.25", "0x00FF"])
    );
    assert_eq!(first["value"]["rowCount"], 53);
    assert_eq!(first["value"]["pageCount"], 2);
    let second = plugin.preview(&path, Some("records"), 1);
    assert_eq!(
        second["value"]["rows"],
        json!([
            ["50", "row-50", "1.25", "0x00FF"],
            ["51", "row-51", "1.25", "0x00FF"],
            ["52", format!("{}…", "界".repeat(256)), "1.25", "0x00FF"]
        ])
    );
    assert_eq!(
        plugin.preview(&path, Some("quoted\"table"), 0)["value"]["rows"],
        json!([["safe"]])
    );
    assert_eq!(
        plugin.preview(&path, Some("empty_table"), 0)["value"]["rows"],
        json!([])
    );
    assert_eq!(
        plugin.preview(&path, Some("records"), 2)["error"]["code"],
        "invalid_page"
    );
    assert_eq!(
        plugin.preview(&path, Some("records; DROP TABLE records"), 0)["error"]["code"],
        "invalid_table"
    );
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert_eq!(
        std::fs::read_dir(directory.path()).unwrap().count(),
        1,
        "closed database preview must not create sidecars"
    );

    let writer = Connection::open(&path).unwrap();
    writer
        .execute_batch(
            "PRAGMA journal_mode=WAL; INSERT INTO records VALUES(53, 'new WAL row', NULL, NULL);",
        )
        .unwrap();
    assert_eq!(
        plugin.preview(&path, Some("records"), 1)["value"]["rows"][3],
        json!(["53", "new WAL row", null, null])
    );
    drop(writer);
    let snapshot_dir = tempfile::tempdir().unwrap();
    let snapshot = snapshot_dir.path().join("snapshot #1.sqlite");
    std::fs::copy(&path, &snapshot).unwrap();
    let copied = plugin.call(json!({"type":"dispatchCommand", "command":"preview.render", "args":{"path":snapshot,"page":0,"table":"records","snapshot":true}}));
    assert_eq!(copied["value"]["rowCount"], 54);
    assert_eq!(
        std::fs::read_dir(snapshot_dir.path()).unwrap().count(),
        1,
        "immutable downloaded snapshots must not create sidecars"
    );

    let invalid = directory.path().join("private-path.sqlite");
    std::fs::write(&invalid, b"private-database-content").unwrap();
    let error = plugin.preview(&invalid, None, 0);
    assert_eq!(error["error"]["code"], "database_unreadable");
    assert!(!error.to_string().contains("private-"));
    let missing = directory.path().join("missing.sqlite");
    assert_eq!(
        plugin.preview(&missing, None, 0)["error"]["code"],
        "database_unreadable"
    );
    assert!(!missing.exists());
    let generated = directory.path().join("generated.sqlite");
    let db = Connection::open(&generated).unwrap();
    db.execute_batch("CREATE TABLE computed(id INTEGER, huge BLOB GENERATED ALWAYS AS (zeroblob(20971520)) VIRTUAL); INSERT INTO computed(id) VALUES(1);").unwrap();
    drop(db);
    assert_eq!(
        plugin.preview(&generated, Some("computed"), 0)["error"]["code"],
        "database_unreadable"
    );
}
