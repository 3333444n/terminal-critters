import { hash } from '../canvas'
import type { Scene } from '../scene'

const WALL = 0x8a6f2f
const DUST = [0x6a4a2a, 0x8a5a2a, 0x5a3a22]

export const dungeon: Scene = {
  id: 'dungeon',
  name: 'Loop Dungeon',
  author: 'terminal-critters',
  draw(c, f) {
    // Floating dust.
    for (let i = 0; i < Math.floor(c.w / 4); i++) {
      const x = Math.floor(hash(i) * c.w)
      const y = 3 + Math.floor((hash(i + 50) * (c.h - 5) + Math.sin(f.t + i) * 1.2))
      c.rect(x, y, 2, 1, DUST[i % DUST.length]!)
    }
    // Ceiling and floor.
    c.rect(0, 0, c.w, 2, WALL)
    c.rect(0, c.h - 1, c.w, 1, WALL)
    // The door on the right, with a gem and three stars.
    const doorX = c.w - 10
    for (let y = 3; y < c.h - 1; y++) {
      c.set(doorX, y, 0xc8a050)
      c.set(doorX + 7, y, 0xc8a050)
    }
    for (let x = doorX; x <= doorX + 7; x++) c.set(x, 3, 0xc8a050)
    c.text(doorX + 3, 3, '◆', 0xf0c040)
    c.text(doorX + 2, 4, '★★★', 0xe8d8a0)
    // A torch that flickers.
    const flame = hash(Math.floor(f.t * 8)) > 0.5 ? 0xf09030 : 0xf0c040
    c.rect(doorX - 6, c.h - 9, 1, 3, 0x6a4a2a)
    c.rect(doorX - 6, c.h - 11, 1, 2, flame)
    // Each tool call wakes a little scarab guarding its label.
    for (const h of f.happenings) {
      if (h.age > 12) continue
      const col = 3 + ((h.seed * 19) % Math.max(1, c.cols - 30))
      const row = 1 + (h.seed % 2)
      c.text(col, row, h.label, 0x7fd4e0)
      c.text(col + Math.floor(h.label.length / 2) - 1, row + 1, '(o)', 0x7fd4e0)
    }
  },
  lines: {
    read: ['Reading the runes on {label}.', 'A scarab guards {label}.'],
    edit: ['Pulling the {label} lever.', 'Moving stones in {label}.'],
    bash: ['Casting {label}. Stand back.', 'Rolling the dice: {label}.'],
    think: ['Which way is out?', 'The door has three stars. Hmm.', 'Listening for traps.'],
  },
}
