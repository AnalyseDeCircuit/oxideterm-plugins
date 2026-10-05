# Certificate Viewer

Open PEM, DER, CRT and CER files through local or SFTP preview. Select a certificate from the file and inspect/copy its basic and detailed fields.

Shows subject, issuer, validity dates, alternative DNS/IP names, usages, algorithm identifiers, serial, extension OIDs and SHA-256/SHA-1 fingerprints. Limits: 10 MiB and 64 certificates.

Only the selected file is parsed. Validity dates do not establish system trust, chain validity, signature correctness or revocation status; those are explicitly unchecked. No system store or network is accessed. Only CERTIFICATE PEM blocks are decoded; private keys and other blocks never enter results. Raw input is held in zeroizing buffers. DER accepts one or concatenated certificates and rejects malformed data. P12/PFX and password prompts are not supported.

## Build and test

From the marketplace repository root:

```sh
node scripts/build-inspection-plugin.mjs certificate-preview --local
node scripts/verify-inspection-plugin.mjs certificate-preview --local
```

Runtime packages are native executables and do not require Node.js or system parsers. Official packages require `>2.2.0`; local variants require the newly compiled inspection host even if labeled 2.2.0, and must not be listed. Omit `--local` for official packages. Release tooling automatically assigns the preview category. The six-platform workflow builds and verifies each asset without automatic publication.

Wrapper and shared protocol: MIT. Parser dependencies retain their respective licenses.
