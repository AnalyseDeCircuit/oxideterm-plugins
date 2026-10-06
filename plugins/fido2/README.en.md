# FIDO Security Key

Authenticate SSH using an existing `ed25519-sk` or `ecdsa-sk` private-key file. The independent provider owns libfido2; OxideTerm owns SSH authentication, native PIN and touch prompts, cancellation and process cleanup. No tab or sidebar is registered.

Requires OxideTerm 2.2.2 or later with the `helper` runtime. Install the plugin, approve its native-process permission, enable it, and select the hardware-backed private-key file in the SSH connection. The initial capability requires a host update; subsequent provider updates are independent.

No enrollment, private-key export or PIN caching is implemented. Generate hardware credentials with a FIDO-capable OpenSSH `ssh-keygen`, then install the public key on the server. Missing devices, missing credentials and blocked PINs produce explicit errors.

Run `node scripts/build.mjs` and `node scripts/verify-package.mjs`. Native build dependencies are libfido2, libcbor, OpenSSL, a C toolchain and pkg-config; Windows uses static vcpkg dependencies. Packages include required non-system shared libraries. End users do not need Homebrew or vcpkg.

The six native jobs in `.github/workflows/fido2.yml` build and package each target. Package checks cover protocol startup, errors and runtime dependencies. Real device presence, PIN behavior and SSH login still require hardware validation. Software-signing fixtures are not hardware validation.

The private stdio protocol is bounded and length-prefixed. The host checks the version before sending one signing request. Owned handle and PIN buffers are cleared and never logged or persisted. Cancellation, timeout and provider retirement stop and reap the child.

Published versions and assets are immutable. Catalog v1 is frozen; new releases enter v2 only. Old clients must upgrade the host to discover these releases.
