import { hash } from '../canvas'
import { CRITTER_HEIGHT } from '../critter'
import type { Scene } from '../scene'

const BELT = 0x5e5c9e
const BELT_DARK = 0x46447e
const BOX = 0xb8a06a

export const factory: Scene = {
  id: 'factory',
  name: 'Response Factory',
  author: 'terminal-critters',
  draw(c, f) {
    const beltTop = c.h - 5
    // Sparks in the air.
    for (let i = 0; i < 8; i++) {
      if (hash(i + Math.floor(f.t * 3) * 31) < 0.6) continue
      c.text(Math.floor(hash(i) * c.cols), Math.floor(hash(i + 9) * (c.rows - 3)), '*', 0xb0c8f0)
    }
    // The belt: teeth that roll left, then the body.
    const shift = Math.floor(f.t * 6)
    for (let x = 0; x < c.w; x++) {
      if ((x + shift) % 3 !== 0) c.set(x, beltTop, BELT)
    }
    c.rect(0, beltTop + 1, c.w, 3, BELT_DARK)
    // Each tool call rides the belt as a crate with its label on it.
    for (const h of f.happenings) {
      if (h.age > 16) continue
      const width = h.label.length + 2
      const col = Math.round(c.cols - h.age * 6)
      if (col + width < 0) continue
      c.rect(col, beltTop - 4, width, 4, BOX)
      c.text(col + 1, Math.floor((beltTop - 3) / 2), h.label, 0x2a2010)
    }
    // A chute on the far right.
    c.rect(c.w - 6, beltTop - 8, 5, 8, 0x8a8a70)
    c.rect(c.w - 5, beltTop - 7, 3, 7, 0x5a5a48)
  },
  pose(c, f) {
    const span = Math.max(1, c.w - 34)
    const d = (f.t * 7) % (span * 2)
    const forward = d < span
    return {
      x: 4 + Math.round(forward ? d : span * 2 - d),
      y: c.h - 5 - CRITTER_HEIGHT,
      flip: !forward,
      step: (Math.floor(f.t * 7) % 2) as 0 | 1,
    }
  },
  lines: {
    read: ['Inspecting crate {label}.', 'Quality check on {label}.'],
    edit: ['Re-packing {label}.', 'New label on {label}.'],
    bash: ['Belt speed up: {label}.', 'Feeding {label} into the machine.'],
    think: ['Waiting for the next crate.', 'The machine hums.', 'Clocking in.'],
  },
}
