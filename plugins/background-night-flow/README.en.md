# Night Flow

[简体中文](README.md) | **English**

One original 4K looping background with deep blue and violet surfaces for dark appearances. This plugin contains this background only, executes no code, and requests no additional permissions.

## Media specifications

- File: `assets/oxide-night-flow-4k-v1.mp4`
- Resolution: 3840 × 2160; 24 fps; 16-second loop.
- Encoding: H.264, 8-bit YUV 4:2:0, no audio.
- Rendered at native 4K; the player downsamples using automatic or user-selected dimensions.

## Install and use

Requires OxideTerm 2.2.3 or later. Open Settings → Appearance → Get More Backgrounds, install Night Flow from the marketplace, then select it in the media library.

Installation leaves the current appearance unchanged. Media is imported into the current configuration's data directory, including portable storage. Uninstalling the plugin leaves imported media available; delete it separately in the library. Existing users of the two-background bundle do not need to install the same background again.

## Production and release

Run `npm run check` in this directory to inspect the actual video. Use `npm run package:unix` or `npm run package:windows` to create a portable ZIP containing this background only. Each background has its own plugin identity and version; the release tag is `background-night-flow-v1.0.0`.

Original artwork by OxideTerm Contributors, licensed under CC BY 4.0. See [LICENSE](LICENSE).
