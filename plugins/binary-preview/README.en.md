# Binary Inspector

Inspect ELF, Mach-O and PE files through file preview, including extensionless executables recognized by their headers. Provides overview, section browsing and hexadecimal views.

Shows architecture, bitness, byte order, virtual entry point, file size and whole-file SHA-256. Universal Mach-O files allow architecture selection. LC_MAIN slice offsets are mapped to virtual entry addresses, with the absolute file entry offset shown separately. Section offsets are absolute within the whole file. Sections without file data cannot be opened.

Select a section offset or enter a decimal/0x hexadecimal offset. The host reuses its hex formatter and native read-only editor, loading 512 bytes at a time. Unknown .bin files retain checksum and hex inspection. No editing, execution or disassembly. Limits: 10 MiB, 64 architectures and 1024 sections.

## Build and test

From the marketplace repository root:

```sh
node scripts/build-inspection-plugin.mjs binary-preview --local
node scripts/verify-inspection-plugin.mjs binary-preview --local
```

Runtime packages are native executables and do not require Node.js or system parsers. Official packages require `>2.2.0`; local variants require the newly compiled inspection host even if labeled 2.2.0, and must not be listed. Omit `--local` for official packages. Release tooling automatically assigns the preview category. The six-platform workflow builds and verifies each asset without automatic publication.

Wrapper and shared protocol: MIT. Parser dependencies retain their respective licenses.
