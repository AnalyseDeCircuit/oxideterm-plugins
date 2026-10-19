import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const host = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(path.join(host, 'crates/oxideterm-plugin-registry/Cargo.toml'))) {
  throw new Error('Usage: node scripts/check-host.mjs /path/to/OxideTerm');
}
const dir = path.join(root, 'target/host-contract-check');
fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
const hostManifest = fs.readFileSync(path.join(host, 'Cargo.toml'), 'utf8');
const patches = hostManifest.match(/\[patch\.crates-io\]\n([\s\S]*?)(?=\n\[|$)/)?.[0];
if (!patches) throw new Error('Host Cargo patch configuration is missing.');
fs.writeFileSync(path.join(dir, 'Cargo.toml'), `[package]\nname="mqtt-host-contract-check"\nversion="0.1.0"\nedition="2024"\n[dependencies]\nserde_json="1"\noxideterm-plugin-registry={path=${JSON.stringify(path.join(host, 'crates/oxideterm-plugin-registry'))}}\n`);
fs.copyFileSync(path.join(host, 'Cargo.lock'), path.join(dir, 'Cargo.lock'));
fs.appendFileSync(path.join(dir, 'Cargo.toml'), '\n' + patches.replace(/path = "([^"]+)"/g, (_, relative) => `path = ${JSON.stringify(path.resolve(host, relative))}`) + '\n[profile.dev]\ndebug=0\n');
fs.writeFileSync(path.join(dir, 'src/main.rs'), `
use oxideterm_plugin_registry::{NativePluginManifest,NativePluginDeclarativeUiSchema,validate_native_plugin_declarative_ui_schema};
fn main() {
    let root=std::path::PathBuf::from(std::env::args().nth(1).unwrap());
    let manifest:NativePluginManifest=serde_json::from_slice(&std::fs::read(root.join("plugin.json")).unwrap()).unwrap();
    for connection in manifest.contributes.unwrap().connections.unwrap() {
        validate_native_plugin_declarative_ui_schema(&connection.form).unwrap();
    }
    let fixtures=root.join("target/host-schemas");
    let paths:Vec<_>=std::fs::read_dir(fixtures).unwrap().collect();
    assert!(!paths.is_empty(),"run npm test to capture real runtime schemas first");
    for path in paths {
        let path=path.unwrap().path();
        let schema:NativePluginDeclarativeUiSchema=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        validate_native_plugin_declarative_ui_schema(&schema).unwrap_or_else(|e|panic!("{}: {e}",path.display()));
    }
    println!("Host accepted the connection form and captured runtime workbenches.");
}
`);
execFileSync('cargo', ['run','--quiet','--manifest-path',path.join(dir,'Cargo.toml'),'--target-dir',path.join(host,'target'),'--',root], { stdio: 'inherit' });
