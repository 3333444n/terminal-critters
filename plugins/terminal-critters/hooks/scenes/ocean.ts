import { hash } from '../canvas'
import type { Scene } from '../scene'

const WATER = 0x3a6f92
const FOAM = 0x5c93b5
const REEF = [0x2f8f8a, 0x3a5fa0, 0x4a7fbf]

export const ocean: Scene = {
  id: 'ocean',
  name: 'Deep Dive',
  author: 'terminal-critters',
  draw(c, f) {
    // A reef of colored pixels on the right.
    for (let i = 0; i < Math.floor(c.w / 3); i++) {
      const x = Math.floor(c.w * 0.55 + hash(i) * c.w * 0.45)
      const y = Math.floor(c.h * 0.35 + hash(i + 300) * c.h * 0.6)
      if ((Math.floor(f.t * 2) + i) % 9 === 0) continue
      c.set(x, y, REEF[i % REEF.length]!)
    }
    // Bubbles rising.
    for (let i = 0; i < Math.floor(c.cols / 6); i++) {
      const col = Math.floor(hash(i + 11) * c.cols)
      const rise = (f.t * (0.8 + hash(i + 12) * 1.2) + hash(i + 13) * c.rows) % c.rows
      const row = c.rows - 1 - Math.floor(rise)
      c.text(col, row, hash(i + 14) > 0.5 ? 'o' : '°', 0xbfd8ea)
    }
    // A fish swimming the other way.
    const fishCol = Math.round(c.cols - ((f.t * 7) % (c.cols + 6)))
    c.text(fishCol, Math.max(1, c.rows - 3), '<><', 0xf0c040)
    // Each tool call floats up in its own bubble.
    for (const h of f.happenings) {
      if (h.age > 10) continue
      const col = 4 + (h.seed * 17) % Math.max(1, c.cols - 20)
      const row = Math.round(c.rows - 2 - h.age * 0.8)
      if (row < 0) continue
      c.text(col, row, `(( ${h.label} ))`, 0x9fd4f0)
    }
  },
  pose(c, f) {
    const span = Math.max(1, c.w - 34)
    const d = (f.t * 5) % (span * 2)
    const forward = d < span
    return {
      x: 4 + Math.round(forward ? d : span * 2 - d),
      y: Math.round(c.h - 14 + Math.sin(f.t * 2.2) * 1.5),
      flip: !forward,
      step: (Math.floor(f.t * 4) % 2) as 0 | 1,
    }
  },
  front(c, f) {
    // Rolling waves along the bottom, over the critter's feet.
    for (let x = 0; x < c.w; x++) {
      const top = c.h - 2 - Math.round((Math.sin(x * 0.3 + f.t * 2.4) + 1) * 1.2)
      for (let y = top; y < c.h; y++) c.set(x, y, y === top ? FOAM : WATER)
    }
  },
  lines: {
    read: ['Diving down to read {label}.', 'Something shiny in {label}.'],
    bash: ['Bubbles from {label}. Good sign?', 'Stirring the current: {label}.'],
    edit: ['Rearranging the reef in {label}.'],
    think: ['Blub.', 'Listening to the deep.', 'Floating on it.'],
  },
}
