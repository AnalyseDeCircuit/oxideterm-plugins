use std::{env, fs, path::PathBuf};

fn main() {
    let manifest_path = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"))
        .join("plugin.json");
    println!("cargo:rerun-if-changed={}", manifest_path.display());

    // Keep plugin.json as the only editable source for the public plugin id.
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&manifest_path).expect("read plugin.json"))
            .expect("parse plugin.json");
    let plugin_id = manifest["id"].as_str().expect("plugin.json id");
    assert!(
        plugin_id
            .chars()
            .all(|character| character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '-')),
        "plugin.json id must use lowercase reverse-domain characters"
    );
    println!("cargo:rustc-env=OXIDETERM_PLUGIN_ID={plugin_id}");
}
