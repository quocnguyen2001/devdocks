#!/usr/bin/env node
// Rasterize the committed SVG logo sources into the app-icon source PNG and the
// monochrome menu-bar tray template PNGs. Run via `pnpm icons:generate`; the
// `pnpm icons:build` script then runs `tauri icon` to produce the .icns/.ico set.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = resolve(root, "src-tauri/icons");
mkdirSync(iconsDir, { recursive: true });

async function generate() {
  // Full-color app icon source (tauri icon consumes this 1024² PNG).
  await sharp(resolve(root, "designs/logo-app-master.svg"))
    .resize(1024, 1024)
    .png()
    .toFile(resolve(iconsDir, "app-icon-1024.png"));

  // Monochrome tray template (alpha-only) at @1x and @2x.
  for (const [size, name] of [
    [18, "tray-icon-Template.png"],
    [36, "tray-icon-Template@2x.png"],
  ]) {
    await sharp(resolve(root, "designs/logo-tray-template.svg"))
      .resize(size, size)
      .png()
      .toFile(resolve(iconsDir, name));
  }

  console.log("Icons generated in src-tauri/icons/");
}

generate().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
