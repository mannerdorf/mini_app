#!/usr/bin/env node
/**
 * Cross-platform генерация Android/PWA иконок (Linux + macOS).
 * Исходники: public/haulz-icon.svg + haulz-icon-foreground.svg
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICON_SVG = path.join(ROOT, "public/haulz-icon.svg");
const FG_SVG = path.join(ROOT, "public/haulz-icon-foreground.svg");
const PUBLIC = path.join(ROOT, "public");
const ANDROID_RES = path.join(ROOT, "android/app/src/main/res");

function renderSvg(svgPath, outPath, width, height = width) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  execFileSync(
    "npx",
    ["--yes", "@resvg/resvg-js-cli", svgPath, outPath, "--fit-width", String(width), "--fit-height", String(height)],
    { cwd: ROOT, stdio: "ignore" },
  );
}

function writeSolidPng(outPath, width, height, hex) {
  const tmpSvg = path.join(ROOT, ".icon-gen-solid.svg");
  fs.writeFileSync(
    tmpSvg,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${hex}"/></svg>`,
  );
  renderSvg(tmpSvg, outPath, width, height);
  fs.unlinkSync(tmpSvg);
}

function main() {
  if (!fs.existsSync(ICON_SVG) || !fs.existsSync(FG_SVG)) {
    console.error("Missing haulz-icon.svg or haulz-icon-foreground.svg in public/");
    process.exit(1);
  }

  renderSvg(ICON_SVG, path.join(PUBLIC, "pwa-512.png"), 512);
  renderSvg(ICON_SVG, path.join(PUBLIC, "pwa-192.png"), 192);
  renderSvg(ICON_SVG, path.join(PUBLIC, "apple-touch-icon.png"), 180);
  renderSvg(ICON_SVG, path.join(PUBLIC, "favicon-32.png"), 32);
  renderSvg(ICON_SVG, path.join(PUBLIC, "favicon-16.png"), 16);
  fs.copyFileSync(path.join(PUBLIC, "pwa-192.png"), path.join(PUBLIC, "favicon.png"));
  renderSvg(FG_SVG, path.join(PUBLIC, "haulz-wordmark.png"), 400);
  fs.copyFileSync(path.join(PUBLIC, "haulz-wordmark.png"), path.join(PUBLIC, "haulz-logo.png"));
  renderSvg(FG_SVG, path.join(ANDROID_RES, "drawable/splash_wordmark.png"), 320);

  for (const [dens, px] of [
    ["mdpi", 48],
    ["hdpi", 72],
    ["xhdpi", 96],
    ["xxhdpi", 144],
    ["xxxhdpi", 192],
  ]) {
    renderSvg(ICON_SVG, path.join(ANDROID_RES, `mipmap-${dens}/ic_launcher.png`), px);
    renderSvg(ICON_SVG, path.join(ANDROID_RES, `mipmap-${dens}/ic_launcher_round.png`), px);
  }

  for (const [dens, px] of [
    ["mdpi", 108],
    ["hdpi", 162],
    ["xhdpi", 216],
    ["xxhdpi", 324],
    ["xxxhdpi", 432],
  ]) {
    renderSvg(FG_SVG, path.join(ANDROID_RES, `mipmap-${dens}/ic_launcher_foreground.png`), px);
  }

  for (const [folder, h, w] of [
    ["drawable-port-mdpi", 480, 320],
    ["drawable-port-hdpi", 800, 480],
    ["drawable-port-xhdpi", 1280, 720],
    ["drawable-port-xxhdpi", 1920, 1080],
    ["drawable-port-xxxhdpi", 2560, 1440],
    ["drawable-land-mdpi", 320, 480],
    ["drawable-land-hdpi", 480, 800],
    ["drawable-land-xhdpi", 720, 1280],
    ["drawable-land-xxhdpi", 1080, 1920],
    ["drawable-land-xxxhdpi", 1440, 2560],
  ]) {
    writeSolidPng(path.join(ANDROID_RES, folder, "splash.png"), w, h, "#3655ff");
  }

  console.log("Icons written to public/ and android/app/src/main/res/");
}

main();
