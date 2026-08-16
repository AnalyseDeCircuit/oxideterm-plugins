#!/usr/bin/env sh

# SPDX-License-Identifier: MIT

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
plugin_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
manifest_path="$plugin_root/plugin.json"
dist_dir="$plugin_root/dist"

package_identity=$(node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(manifest.id)) throw new Error("Invalid plugin id");
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw new Error("Invalid plugin version");
  process.stdout.write(`${manifest.id}-${manifest.version}`);
' "$manifest_path")
artifact_path="$dist_dir/$package_identity.zip"

mkdir -p "$dist_dir"
rm -f "$artifact_path"

(
  cd "$plugin_root"
  zip -X -q "$artifact_path" plugin.json README.md README.en.md LICENSE
)

if command -v shasum >/dev/null 2>&1; then
  package_digest=$(shasum -a 256 "$artifact_path" | awk '{print $1}')
else
  package_digest=$(sha256sum "$artifact_path" | awk '{print $1}')
fi
package_size=$(wc -c < "$artifact_path" | tr -d ' ')

printf 'Artifact: %s\nSHA-256: %s\nSize: %s bytes\n' \
  "$artifact_path" "$package_digest" "$package_size"
