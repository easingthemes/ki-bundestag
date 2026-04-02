/**
 * Post-build script: reorganize dist/ for the static + SPA architecture.
 *
 * After `vite build` outputs to dist/, this script:
 *  1. Moves the SPA entry (dist/index.html + dist/assets/) into dist/app/
 *  2. Copies static HTML pages from static/ into dist/ root
 *  3. Result: static pages at /, /about, etc. and SPA at /app/
 *
 * Run after `vite build`:  node scripts/prerender.js
 */

import { cpSync, mkdirSync, renameSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");
const STATIC = resolve(__dirname, "../static");

function build() {
  if (!existsSync(resolve(DIST, "index.html"))) {
    console.error("dist/index.html not found — run `vite build` first");
    process.exit(1);
  }

  // 1. Create dist/app/ and move SPA files there
  const appDir = resolve(DIST, "app");
  mkdirSync(appDir, { recursive: true });

  // Move SPA index.html → dist/app/index.html
  renameSync(resolve(DIST, "index.html"), resolve(appDir, "index.html"));
  console.log("  Moved index.html → app/index.html");

  // Move assets/ → app/assets/
  const assetsDir = resolve(DIST, "assets");
  if (existsSync(assetsDir)) {
    renameSync(assetsDir, resolve(appDir, "assets"));
    console.log("  Moved assets/ → app/assets/");
  }

  // 2. Copy static HTML pages into dist/
  if (!existsSync(STATIC)) {
    console.error("static/ directory not found");
    process.exit(1);
  }

  cpSync(STATIC, DIST, { recursive: true });

  // Count what we copied
  const staticFiles = [];
  function walk(dir, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(resolve(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".html")) staticFiles.push(`${prefix}${entry.name}`);
    }
  }
  walk(STATIC);
  console.log(`  Copied ${staticFiles.length} static pages: ${staticFiles.join(", ")}`);

  console.log("Build complete: static site at / + SPA at /app/");
}

build();
