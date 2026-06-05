/**
 * Generates PWA icons from a hand-crafted SVG (the Mimir mark) using sharp.
 *
 * Usage: node scripts/gen-icons.mjs
 * Output:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/favicon-32.png
 *   public/icons/apple-touch-icon.png
 *   public/icons/mimir-logo.svg   (also written for in-app inline use)
 */

import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ─── Design ──────────────────────────────────────────────────────────────────
// MIMIR — Norse god of wisdom, his head an oracle living at the bottom of a
// well. The mark is the well in profile: a dark deep circle at the centre
// (the well of wisdom), with a luminous horizontal line behind it (the
// surface of the water reflecting the eye that drinks from it). Three short
// orbital ticks around the core suggest the all-seeing, all-knowing aspect.
//
// Geometry (512-unit viewBox):
//   • Background    — dark slate (#0a0a0a), 112px iOS-style rounded square
//   • Horizon       — thin gold horizontal line crossing the canvas
//   • Outer ring    — gold ring around the well opening
//   • Core dot      — small filled gold dot (the eye/oracle)
//   • Orbital ticks — three short arcs at 30°, 150°, 270° around the ring
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = '#d4b85a'
const GOLD_DIM = '#a08938'
const BG = '#0a0a0a'

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- iOS-style rounded square background -->
  <rect width="512" height="512" rx="112" fill="${BG}"/>

  <!-- Horizon: surface of the well, fading at both ends -->
  <defs>
    <linearGradient id="horizon" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"    stop-color="${GOLD}" stop-opacity="0"/>
      <stop offset="0.18" stop-color="${GOLD}" stop-opacity="0.55"/>
      <stop offset="0.50" stop-color="${GOLD}" stop-opacity="0.95"/>
      <stop offset="0.82" stop-color="${GOLD}" stop-opacity="0.55"/>
      <stop offset="1"    stop-color="${GOLD}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0"    stop-color="${GOLD}" stop-opacity="0.55"/>
      <stop offset="0.6"  stop-color="${GOLD}" stop-opacity="0.10"/>
      <stop offset="1"    stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Soft glow behind the core for depth -->
  <circle cx="256" cy="256" r="170" fill="url(#glow)"/>

  <!-- Horizon line -->
  <rect x="40" y="252" width="432" height="8" rx="4" fill="url(#horizon)"/>

  <!-- Outer ring (the well opening) -->
  <circle cx="256" cy="256" r="116" fill="none" stroke="${GOLD}" stroke-width="6"/>

  <!-- Three orbital ticks at 30°, 150°, 270° -->
  ${[30, 150, 270].map((deg) => {
    const rad = (deg * Math.PI) / 180
    const r1 = 140
    const r2 = 156
    const x1 = (256 + Math.cos(rad) * r1).toFixed(2)
    const y1 = (256 + Math.sin(rad) * r1).toFixed(2)
    const x2 = (256 + Math.cos(rad) * r2).toFixed(2)
    const y2 = (256 + Math.sin(rad) * r2).toFixed(2)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${GOLD_DIM}" stroke-width="5" stroke-linecap="round"/>`
  }).join('\n  ')}

  <!-- Core: the oracle eye / Odin's eye at the bottom of the well -->
  <circle cx="256" cy="256" r="42" fill="${GOLD}"/>
  <circle cx="256" cy="256" r="14" fill="${BG}"/>
</svg>`

mkdirSync(join(ROOT, 'public/icons'), { recursive: true })

// Write the source SVG for in-app inline use (login screen etc.)
writeFileSync(join(ROOT, 'public/icons/mimir-logo.svg'), SVG)

const sizes = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' },
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
