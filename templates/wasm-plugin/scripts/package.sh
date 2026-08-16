#!/usr/bin/env sh

# SPDX-License-Identifier: MIT

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
plugin_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
manifest_path="$plugin_root/plugin.json"
dist_dir="$plugin_root/dist"

node "$script_dir/check.mjs"
(cd "$plugin_root" && cargo fmt --all -- --check)
(cd "$plugin_root" && cargo build --release --target wasm32-wasip1)
cp "$plugin_root/target/wasm32-wasip1/release/plugin.wasm" "$plugin_root/plugin.wasm"

package_identity=$(node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(`${manifest.id}-${manifest.version}`);
' "$manifest_path")
artifact_path="$dist_dir/$package_identity.zip"

mkdir -p "$dist_dir"
rm -f "$artifact_path"
(
  cd "$plugin_root"
  zip -X -q "$artifact_path" plugin.json plugin.wasm README.md README.en.md LICENSE
)

if command -v shasum >/dev/null 2>&1; then
  package_digest=$(shasum -a 256 "$artifact_path" | awk '{print $1}')
else
  package_digest=$(sha256sum "$artifact_path" | awk '{print $1}')
fi
package_size=$(wc -c < "$artifact_path" | tr -d ' ')

printf 'Artifact: %s\nSHA-256: %s\nSize: %s bytes\n' \
  "$artifact_path" "$package_digest" "$package_size"
