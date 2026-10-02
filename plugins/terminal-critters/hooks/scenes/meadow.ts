import { hash } from '../canvas'
import type { Scene } from '../scene'

const GROUND = 0x8a7a2a
const LEAVES = [0xb0703a, 0x8a5a2e, 0xc8903e]

export const meadow: Scene = {
  id: 'meadow',
  name: 'Bug Meadow',
  author: 'terminal-critters',
  draw(c, f) {
    // Leaves drifting down and to the left.
    for (let i = 0; i < Math.floor(c.w / 5); i++) {
      const fall = (f.t * (1.5 + hash(i) * 2) + hash(i + 7) * c.h) % c.h
      const x = (((hash(i + 3) * c.w - f.t * 2 - fall * 0.5) % c.w) + c.w) % c.w
      c.rect(Math.round(x), Math.floor(fall), 2, 1, LEAVES[i % LEAVES.length]!)
    }
    // Grass on the left, swaying.
    const sway = Math.floor(f.t * 2) % 2
    for (let col = 0; col < Math.min(14, c.cols); col++) {
      const glyph = ((col + sway) % 3 === 0 ? '\\' : (col + sway) % 3 === 1 ? '/' : '|')
      c.text(col, c.rows - 2, glyph, 0x7fae4a)
      if (col % 2 === 0) c.text(col, c.rows - 3, glyph, 0x6a9a3a)
    }
    // A flower on a stem.
    const fx = Math.floor(c.w * 0.6)
    for (let y = c.h - 8; y < c.h - 1; y++) c.set(fx, y, 0x4f8a3a)
    c.text(fx - 1, c.rows - 5, '♣♣♣', 0x6fbf4a)
    // The ground.
    c.rect(0, c.h - 1, c.w, 1, GROUND)
    // Each tool call puts up a little sign.
    for (const h of f.happenings) {
      if (h.age > 12) continue
      const col = 18 + ((h.seed * 23) % Math.max(1, c.cols - 36))
      const postX = col + 1
      for (let y = c.h - 6; y < c.h - 1; y++) c.set(postX, y, 0x8a6a3a)
      c.text(col, c.rows - 4, `[${h.label}]`, 0xf0d98a)
    }
  },
  lines: {
    read: ['And here we see {label} in its natural habitat.', 'Turning over the rock called {label}.'],
    edit: ['Planting something new in {label}.', 'Pruning {label}.'],
    bash: ['Watering {label}. Let us see what grows.'],
    think: ['The rare bug is quiet now.', 'Listening to the grass.', 'Patience. Things grow.'],
  },
}
