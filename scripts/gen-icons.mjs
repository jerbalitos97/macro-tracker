/**
 * Generates solid-color PNG icons without external dependencies.
 * Uses raw PNG byte construction via Node's built-in zlib.
 *
 * Usage: node scripts/gen-icons.mjs
 * Output: public/icons/icon-192.png  public/icons/icon-512.png
 */

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Brand colours
const BG  = [0x0a, 0x0a, 0x0a]   // #0a0a0a
const FG  = [0xd4, 0xb8, 0x5a]   // #d4b85a

function makePNG(size) {
  const w = size
  const h = size

  // Build raw RGBA scanlines – draw a centred "M" glyph in gold on dark bg
  const raw = []
  for (let y = 0; y < h; y++) {
    raw.push(0) // filter byte per row
    for (let x = 0; x < w; x++) {
      const fx = x / w
      const fy = y / h
      // Simple "M" silhouette using normalised coords
      const inGlyph = (() => {
        if (fx < 0.15 || fx > 0.85) return false
        if (fy < 0.15 || fy > 0.85) return false
        const lx = fx - 0.15
        const rx = 0.85 - fx
        const stem = 0.08 * (w / 192)
        const nw = 0.12 * (w / 192)
        if (lx < stem) return true   // left stem
        if (rx < stem) return true   // right stem
        // Diagonals from top of stems downward
        const midX = 0.5
        const peakY = 0.35
        const distL = Math.abs((fx - 0.15) / (midX - 0.15) - (fy - 0.15) / (peakY - 0.15))
        const distR = Math.abs((fx - 0.85) / (midX - 0.85) - (fy - 0.15) / (peakY - 0.15))
        if (fy <= peakY && distL < nw) return true
        if (fy <= peakY && distR < nw) return true
        return false
      })()

      const [r, g, b] = inGlyph ? FG : BG
      raw.push(r, g, b, 0xff)
    }
  }

  const rawBuf = Buffer.from(raw)
  const compressed = deflateSync(rawBuf)

  // PNG chunks
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type)
    const crcBuf = Buffer.concat([typeB, data])
    const crc = crc32(crcBuf)
    const crcOut = Buffer.alloc(4)
    crcOut.writeInt32BE(crc)
    return Buffer.concat([len, typeB, data, crcOut])
  }

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // colour type: RGB (no alpha in IHDR; we use RGBA in IDAT)
  // Actually use colour type 6 = RGBA
  ihdr[9] = 6
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace

  const idat = chunk('IDAT', compressed)
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend])
}

// Minimal CRC-32
function crc32(buf) {
  let crc = -1
  for (const byte of buf) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ -1) | 0
}

mkdirSync(join(ROOT, 'public/icons'), { recursive: true })

for (const size of [192, 512]) {
  const outPath = join(ROOT, `public/icons/icon-${size}.png`)
  writeFileSync(outPath, makePNG(size))
  console.log(`✓ ${outPath}`)
}
