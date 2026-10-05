# SQLite Preview

Open SQLite databases through the local file manager or SFTP file preview. Native host tables provide table selection and pages of 50 rows.

Recognizes `.sqlite`, `.sqlite3`, `.db` and `.db3`; ambiguous `.db`/`.db3` files require a SQLite header. Limits: 10 MiB files, 256 ordinary tables and 64 columns per table. Text is truncated after 256 characters; BLOBs show at most 128 bytes in hexadecimal. Ellipses mark truncation. NULL remains distinct from an empty string.

The plugin opens read-only connections and never executes user SQL, creates databases, repairs files or runs migrations. Views, virtual tables and internal tables are excluded. Local WAL reads use SQLite normally. SFTP cannot obtain a consistent online database snapshot by copying the main file: nonempty WAL/rollback journals and detected changes during download block the preview. Use a complete, quiescent backup for remote preview. Data is kept only for the current preview and never written to plugin logs/settings.

Official packages require `>2.2.0` and the new host table-preview interface. `node scripts/build.mjs --local` creates a trial package for a locally rebuilt host still labeled 2.2.0. No installed SQLite, Node.js or database server is needed to run the plugin.

## Build

From this directory:

```sh
node scripts/build.mjs
node scripts/verify-package.mjs
```

Build scripts require Node.js and the marketplace repository's npm dependencies. The six-platform workflow builds natively and tests extracted packages, without publishing automatically.

Plugin code: MIT. Bundled SQLite: public domain.
