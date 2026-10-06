use std::{
    io::{BufRead, Write},
    process::{Command, Stdio},
};

fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "--hold") {
        std::thread::sleep(std::time::Duration::from_secs(30));
        return;
    }
    let descendant = Command::new(std::env::current_exe().unwrap())
        .arg("--hold")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    for line in std::io::stdin().lock().lines() {
        let request: serde_json::Value = serde_json::from_str(&line.unwrap()).unwrap();
        if request["method"] == "initialize" {
            println!(
                "{}",
                serde_json::json!({
                    "jsonrpc": "2.0", "id": request["id"], "result": {
                        "protocolVersion": 1, "agentCapabilities": {},
                        "agentInfo": { "name": "launcher-fixture", "version": "1.0.0" },
                        "authMethods": [], "_meta": {
                            "arguments": args, "cwd": std::env::current_dir().unwrap(),
                            "environment": std::env::var("OXIDETERM_LAUNCHER_FIXTURE").unwrap(),
                            "descendantPid": descendant.id(),
                        }
                    }
                })
            );
            std::io::stdout().flush().unwrap();
        }
    }
}
