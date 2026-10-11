#!/usr/bin/env python3
# Copyright (C) 2026 OxideTerm contributors
# SPDX-License-Identifier: GPL-3.0-only
"""Generate OxideTerm's original looping artwork with NumPy, Pillow and FFmpeg.

Run with --preview-only to inspect the composition before encoding both videos.
No external images, models or source footage are used.
"""

import argparse
import hashlib
from pathlib import Path
import subprocess
import time

import numpy as np
from PIL import Image


ARTWORK = Path(__file__).resolve().parents[1] / "assets"
WIDTH, HEIGHT = 3840, 2160
FPS, SECONDS = 24, 16
Y = np.linspace(-1, 1, HEIGHT, dtype=np.float32)[:, None]
X = np.linspace(-1, 1, WIDTH, dtype=np.float32)[None, :]
RNG = np.random.default_rng(20261010)
# Sub-code-value dither softens quantization without adding a visible grain layer.
DITHER = RNG.uniform(-0.35, 0.35, (HEIGHT, WIDTH, 1)).astype(np.float32)


def smoothstep(low: float, high: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def frame(kind: str, phase: float) -> np.ndarray:
    # Geometry and lighting follow a closed orbit, so the last-to-first interval stays normal.
    cosine, sine = float(np.cos(phase)), float(np.sin(phase))
    light = kind == "dawn-mist"
    top = np.array([218, 236, 239] if light else [17, 25, 49], dtype=np.float32)
    bottom = np.array([247, 238, 222] if light else [8, 16, 35], dtype=np.float32)
    backdrop = top + (bottom - top) * smoothstep(-1, .85, Y)[..., None]
    glow_x = np.exp(-((X + .32 - .045 * sine) / .85) ** 2)
    glow_y = np.exp(-((Y + .10) / .64) ** 2)
    glow_color = np.array([255, 247, 226] if light else [42, 47, 87], dtype=np.float32)

    horizon = -.16 + .43 * np.cos((X + .25) * 1.6) - .34 * X
    horizon += .020 * sine + .014 * cosine * X
    offsets = [0, .20 + .16 * np.sin((X + 1) * .9), .49 + .10 * np.cos(X * 1.3)]
    if light:
        palettes = [
            ([196, 233, 224], [46, 160, 178], [253, 252, 233]),
            ([181, 218, 229], [69, 135, 177], [242, 250, 248]),
            ([228, 232, 217], [125, 186, 185], [254, 246, 218]),
        ]
    else:
        palettes = [
            ([83, 160, 191], [10, 49, 113], [167, 204, 222]),
            ([111, 135, 188], [37, 36, 101], [192, 194, 225]),
            ([77, 127, 166], [12, 37, 78], [118, 182, 210]),
        ]
    edges = [horizon + offset + .009 * np.sin(X * 1.9 + phase + index)
             for index, offset in enumerate(offsets)]
    palettes = [np.asarray(colors, dtype=np.float32) for colors in palettes]
    reflection_x = .4 + .6 * np.exp(-((X - .45 + .07 * sine) / .7) ** 2)
    result = np.empty((HEIGHT, WIDTH, 3), dtype=np.uint8)
    # Horizontal strips keep intermediate color buffers in cache instead of building
    # several full-resolution float canvases for every surface.
    for first in range(0, HEIGHT, 128):
        last = min(first + 128, HEIGHT)
        pixels = np.broadcast_to(backdrop[first:last], (last - first, WIDTH, 3)).copy()
        glow = glow_y[first:last] * glow_x
        pixels += (glow_color - pixels) * (glow * .68)[..., None]
        for index, (edge, colors) in enumerate(zip(edges, palettes)):
            distance = Y[first:last] - edge
            # Far silhouettes are softer; front surfaces retain a fine highlight.
            softness = [.045, .013, .007][index]
            coverage = smoothstep(-softness, softness, distance)
            shallow, deep, highlight = colors
            depth = smoothstep(0, [.32, .28, .55][index], distance)
            surface = shallow + (deep - shallow) * depth[..., None]
            reflection = np.exp(-((distance - .08) / .12) ** 2) * (.28 + .08 * cosine)
            reflection *= reflection_x
            surface += (highlight - surface) * reflection[..., None]
            opacity = coverage * [.82, .91, .95][index]
            pixels += (surface - pixels) * opacity[..., None]
            rim = np.exp(-(distance / [.016, .004, .0025][index]) ** 2)
            rim *= .23 if index == 0 else .42
            pixels += (highlight - pixels) * rim[..., None]
        pixels += DITHER[first:last]
        np.clip(pixels, 0, 255, out=pixels)
        result[first:last] = pixels
    return result


def encode(kind: str, destination: Path) -> None:
    temporary = destination.with_name(f".{destination.stem}.partial.mp4")
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", f"{WIDTH}x{HEIGHT}",
        "-framerate", str(FPS), "-i", "pipe:0", "-an",
        "-vf", "scale=iw:ih:out_color_matrix=bt709:out_range=tv",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-g", str(FPS * 4), "-movflags", "+faststart",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-color_range", "tv", str(temporary),
    ]
    started = last_report = time.perf_counter()
    frames = FPS * SECONDS
    render_seconds = write_seconds = 0.0
    print(f"{kind}: generating {frames} frames at {WIDTH}×{HEIGHT}", flush=True)
    try:
        with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
            try:
                for index in range(frames):
                    before_render = time.perf_counter()
                    pixels = frame(kind, index * np.pi * 2 / frames)
                    before_write = time.perf_counter()
                    encoder.stdin.write(pixels.tobytes())
                    now = time.perf_counter()
                    render_seconds += before_write - before_render
                    write_seconds += now - before_write
                    if now - last_report >= 10 or index + 1 == frames:
                        rate = (index + 1) / (now - started)
                        remaining = (frames - index - 1) / rate
                        print(f"{kind}: {index + 1}/{frames} frames; {rate:.1f} fps; about {remaining:.0f}s left", flush=True)
                        last_report = now
            finally:
                encoder.stdin.close()
            if encoder.wait() != 0:
                raise RuntimeError(f"FFmpeg failed to encode {destination}")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"{kind}: drawing {render_seconds:.1f}s; encoder input {write_seconds:.1f}s; total {time.perf_counter() - started:.1f}s", flush=True)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    print(f"{destination.name}: {destination.stat().st_size / 1024**2:.2f} MiB; SHA-256 {digest}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ARTWORK)
    parser.add_argument("--preview-only", action="store_true")
    parser.add_argument("--scene", choices=["dawn-mist", "night-flow"])
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for kind in [args.scene] if args.scene else ["dawn-mist", "night-flow"]:
        if args.preview_only:
            for quarter in range(4):
                Image.fromarray(frame(kind, quarter * np.pi / 2)).save(
                    args.output_dir / f"oxide-{kind}-{quarter}.png"
                )
        else:
            encode(kind, args.output_dir / f"oxide-{kind}-4k-v1.mp4")


if __name__ == "__main__":
    main()
