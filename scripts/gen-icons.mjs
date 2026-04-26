/**
 * Generates PWA icons from a hand-crafted SVG flame using sharp (WASM-free,
 * pre-built binaries). No native compilation needed on macOS/Linux/Windows.
 *
 * Usage: node scripts/gen-icons.mjs
 * Output:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/favicon-32.png
 */

import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ─── Design ──────────────────────────────────────────────────────────────────
// Dark square with rounded corners.
// A bold geometric flame centred in the lower ⅔ of the canvas.
// Single gold accent (#d4b85a) on #111 background — no gradients, no shadows.
//
// Flame anatomy (in a 512-unit viewBox):
//   • Outer flame  — warm gold, wide teardrop that tapers to a tip at y=90
//   • Inner detail — slightly darker cutout creating visual depth at the core
// ─────────────────────────────────────────────────────────────────────────────

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background with rounded corners matching iOS icon mask -->
  <rect width="512" height="512" rx="112" fill="#111111"/>

  <!-- Outer flame -->
  <path d="
    M 256 88
    C 296 128 368 178 372 268
    C 376 338 340 390 296 420
    C 318 382 316 342 290 316
    C 296 366 268 402 256 422
    C 244 402 216 366 222 316
    C 196 342 194 382 216 420
    C 172 390 136 338 140 268
    C 144 178 216 128 256 88
    Z
  " fill="#d4b85a"/>

  <!-- Inner core — creates the 'hot centre' illusion -->
  <path d="
    M 256 248
    C 272 268 282 298 278 326
    C 274 348 266 364 256 374
    C 246 364 238 348 234 326
    C 230 298 240 268 256 248
    Z
  " fill="#111111" opacity="0.35"/>
</svg>`

mkdirSync(join(ROOT, 'public/icons'), { recursive: true })

const sizes = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 32,  name: 'favicon-32.png' },
]

for (const { size, name } of sizes) {
  const outPath = join(ROOT, `public/icons/${name}`)
  const png = await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png()
    .toBuffer()
  writeFileSync(outPath, png)
  console.log(`✓ ${outPath}  (${(png.length / 1024).toFixed(1)} KB)`)
}
