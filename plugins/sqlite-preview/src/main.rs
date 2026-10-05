// SPDX-License-Identifier: MIT
use rusqlite::{Connection, OpenFlags, types::ValueRef};
use serde_json::{Value, json};
use std::{
    io::{self, BufRead, Write},
    path::Path,
    time::Duration,
};

const PAGE_SIZE: u64 = 50;
const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;

fn bounded_text(text: &str) -> String {
    let mut chars = text.chars();
    let mut value: String = chars.by_ref().take(256).collect();
    if chars.next().is_some() {
        value.push('…');
    }
    value
}

fn preview(args: &Value) -> Result<Value, &'static str> {
    let path = Path::new(args["path"].as_str().ok_or("invalid_request")?);
    if std::fs::metadata(path)
        .map_err(|_| "database_unreadable")?
        .len()
        > MAX_FILE_BYTES
    {
        return Err("database_too_large");
    }
    let page = args["page"]
        .as_u64()
        .filter(|page| *page < 100_000)
        .ok_or("invalid_page")?;
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let connection = if args["snapshot"] == true {
        // Host-owned downloads are quiescent copies. Immutable mode avoids orphan WAL/SHM files.
        let mut uri = url::Url::from_file_path(path).map_err(|_| "database_unreadable")?;
        uri.query_pairs_mut()
            .append_pair("immutable", "1")
            .append_pair("mode", "ro");
        Connection::open_with_flags(uri.as_str(), flags | OpenFlags::SQLITE_OPEN_URI)
    } else {
        Connection::open_with_flags(path, flags)
    }
    .map_err(|_| "database_unreadable")?;
    connection
        .busy_timeout(Duration::from_secs(1))
        .map_err(|_| "database_unreadable")?;
    // Generated columns must not turn a small file into an unbounded allocation.
    connection
        .set_limit(
            rusqlite::limits::Limit::SQLITE_LIMIT_LENGTH,
            MAX_FILE_BYTES as i32,
        )
        .map_err(|_| "database_unreadable")?;
    // Never run user SQL or initialize schema. Keep count and page in the same read snapshot.
    connection
        .execute_batch("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; BEGIN;")
        .map_err(|_| "database_unreadable")?;
    let mut list = connection.prepare("SELECT name FROM pragma_table_list WHERE schema='main' AND type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 257")
        .map_err(|_| "database_unreadable")?;
    let tables = list
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| "database_unreadable")?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "database_unreadable")?;
    if tables.len() > 256 || tables.iter().any(|name| name.len() > 1024) {
        return Err("database_too_large");
    }
    let selected = args
        .get("table")
        .and_then(Value::as_str)
        .or_else(|| tables.first().map(String::as_str));
    let Some(selected) = selected else {
        if page != 0 {
            return Err("invalid_page");
        }
        return Ok(
            json!({"kind":"table", "page":0, "pageCount":1, "tables":[], "selectedTable":null, "columns":[], "rows":[], "rowCount":0}),
        );
    };
    if !tables.iter().any(|name| name == selected) {
        return Err("invalid_table");
    }
    let quoted = format!("\"{}\"", selected.replace('"', "\"\""));
    let count: i64 = connection
        .query_row(&format!("SELECT count(*) FROM {quoted}"), [], |row| {
            row.get(0)
        })
        .map_err(|_| "database_unreadable")?;
    let count = u64::try_from(count).map_err(|_| "database_unreadable")?;
    let page_count = count.div_ceil(PAGE_SIZE).max(1);
    if page_count > 100_000 {
        return Err("database_too_large");
    }
    if page >= page_count {
        return Err("invalid_page");
    }
    let mut statement = connection
        .prepare(&format!("SELECT * FROM {quoted} LIMIT ?1 OFFSET ?2"))
        .map_err(|_| "database_unreadable")?;
    let columns = statement
        .column_names()
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    if columns.len() > 64 || columns.iter().any(|name| name.len() > 1024) {
        return Err("database_too_large");
    }
    let mut cursor = statement
        .query([PAGE_SIZE as i64, (page * PAGE_SIZE) as i64])
        .map_err(|_| "database_unreadable")?;
    let mut rows = Vec::<Vec<Option<String>>>::new();
    while let Some(row) = cursor.next().map_err(|_| "database_unreadable")? {
        let mut cells = Vec::with_capacity(columns.len());
        for column in 0..columns.len() {
            let cell = match row.get_ref(column).map_err(|_| "database_unreadable")? {
                ValueRef::Null => None,
                ValueRef::Integer(value) => Some(value.to_string()),
                ValueRef::Real(value) => Some(value.to_string()),
                ValueRef::Text(bytes) => Some(bounded_text(&String::from_utf8_lossy(bytes))),
                ValueRef::Blob(bytes) => {
                    let mut hex = String::from("0x");
                    for byte in bytes.iter().take(128) {
                        use std::fmt::Write;
                        let _ = write!(hex, "{byte:02X}");
                    }
                    if bytes.len() > 128 {
                        hex.push('…');
                    }
                    Some(hex)
                }
            };
            cells.push(cell);
        }
        rows.push(cells);
    }
    Ok(
        json!({"kind":"table", "page":page, "pageCount":page_count, "tables":tables,
        "selectedTable":selected, "columns":columns, "rows":rows, "rowCount":count}),
    )
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.len() > 64 * 1024 {
            break;
        }
        let Ok(envelope) = serde_json::from_str::<Value>(&line) else {
            break;
        };
        if envelope["protocolVersion"] != 1 {
            break;
        }
        let request = &envelope["payload"];
        let kind = &request["kind"];
        let result = match kind["type"].as_str() {
            Some("activate") => Ok(json!({"ready":true})),
            Some("health") => Ok(json!({"ok":true})),
            Some("deactivate" | "kill") => Ok(json!({"stopped":true})),
            Some("dispatchCommand") if kind["command"] == "preview.render" => {
                preview(&kind["args"])
            }
            _ => Err("unsupported_request"),
        };
        let result = match result {
            Ok(value) => json!({"status":"ok", "value":value}),
            // Database contents, paths and SQLite diagnostics never become error text.
            Err(code) => {
                json!({"status":"error", "error":{"code":code,"message":"Database preview failed","recoverable":true}})
            }
        };
        let response = json!({"protocolVersion":1,"requestId":request["requestId"],"payload":{"requestId":request["requestId"],"result":result}});
        if writeln!(stdout, "{response}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
        if matches!(kind["type"].as_str(), Some("deactivate" | "kill")) {
            break;
        }
    }
}
