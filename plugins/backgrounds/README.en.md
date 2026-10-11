# OxideTerm Backgrounds

[简体中文](README.md) | **English**

Two original looping backgrounds for OxideTerm: Dawn Mist pairs warm ivory with teal, while Night Flow pairs deep blue with soft violet. Smooth surfaces and reflections move gently across continuous gradients, suited to light and dark appearances. This pack contains media only, runs no plugin code, and requests no permissions.

| Background | File | Format |
| --- | --- | --- |
| Dawn Mist | `assets/oxide-dawn-mist-4k-v1.mp4` | 3840 × 2160, 24 fps, 16-second loop |
| Night Flow | `assets/oxide-night-flow-4k-v1.mp4` | 3840 × 2160, 24 fps, 16-second loop |

Both compositions are rendered at 4K before encoding as H.264 with 8-bit YUV 4:2:0 color and no audio. Motion is periodic across one cycle. No external images or footage are used.

## Install and select

1. In Settings → Appearance, click **Get more backgrounds** in the media library to open the marketplace's **Backgrounds** category.
2. Install OxideTerm Backgrounds, then return to the library and select a video.
3. When following the system appearance, choose backgrounds separately for the light and dark appearances.

Installation keeps the current theme and background. Media is copied into `backgrounds` beside the active settings file; portable installations use their own data directory. Uninstalling the pack keeps imported media. Delete it through the media cards when desired.

Published OxideTerm 2.2.2 does not support background packs. This pack requires a subsequent host release containing the feature, with a declared range of `>2.2.2`.

## Playback resolution

The 4K sources are scaled by the existing player. Leave width and height limits blank for automatic sizing, or set limits such as 3840 × 2160, 2560 × 1440, or 1920 × 1080. Library thumbnails use the existing small previews, so separate low-resolution downloads are unnecessary.

## Generate and package

Install NumPy, Pillow, and FFmpeg with libx264, then run from this directory:

```bash
python3 scripts/generate.py
npm run check
npm run package:unix
```

On Windows, use `npm run package:windows`. These tools build the artwork; playback does not require them. The check reads the actual video dimensions, codec, duration, frame rate, and audio tracks.

Use `--preview-only` for phase previews, or `--scene dawn-mist` / `--scene night-flow` to rebuild one video. Generation reports completed frames, speed, and estimated remaining time. It replaces the released media file only after encoding completes successfully.

The release is one portable ZIP with videos at the declared `assets/` paths. The workflow reuses this repository's release-record generator and marketplace synchronization. Its release tag is `backgrounds-v1.0.0`.

Artwork by OxideTerm contributors, licensed under CC BY 4.0; see [LICENSE](LICENSE). The generator retains the original project's GPL-3.0-only license.
