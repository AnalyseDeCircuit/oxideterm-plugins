// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { prepareManifest } from "../../../scripts/release-plugin.mjs";

const pluginRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "plugin.json"), "utf8"));
await prepareManifest(manifest, {version: 1, plugins: []});
if (manifest.license !== "CC-BY-4.0") throw new Error("Expected CC-BY-4.0 artwork license");
for (const media of manifest.contributes.backgrounds) {
  const videoPath = path.join(pluginRoot, media);
  if (!fs.statSync(videoPath).isFile()) throw new Error("Missing declared media: " + media);
  const metadata = JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", videoPath,
  ], {encoding: "utf8"}));
  const video = metadata.streams.filter(stream => stream.codec_type === "video");
  if (video.length !== 1 || metadata.streams.some(stream => stream.codec_type === "audio")) {
    throw new Error(media + ": expected one silent video");
  }
  const stream = video[0];
  if (stream.width !== 3840 || stream.height !== 2160 || stream.codec_name !== "h264"
    || stream.pix_fmt !== "yuv420p" || stream.avg_frame_rate !== "24/1"
    || Math.abs(Number(metadata.format.duration) - 16) > 1 / 24) {
    throw new Error(media + ": expected 4K H.264, yuv420p, 24 fps, 16 seconds");
  }
  console.log(media + ": verified 3840×2160, H.264, 24 fps, 16 seconds, no audio");
}
