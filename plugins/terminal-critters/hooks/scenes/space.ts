import { hash, mix } from '../canvas'
import type { Scene } from '../scene'

const ROCK = [0x5b4fa0, 0x4a5aa8, 0x7a5fb0]
const PLANET = 0x5d4c9e
const MOON = 0x9a9aa6

export const space: Scene = {
  id: 'space',
  name: 'Asteroid Field',
  author: 'terminal-critters',
  draw(c, f) {
    // Twinkling stars, as text so they stay crisp.
    const stars = Math.floor((c.cols * c.rows) / 22)
    for (let i = 0; i < stars; i++) {
      const col = Math.floor(hash(i) * c.cols)
      const row = Math.floor(hash(i + 500) * c.rows)
      const glow = Math.sin(f.t * (1.5 + hash(i + 900) * 2) + i)
      if (glow < -0.3) continue
      const glyph = glow > 0.75 ? '✦' : hash(i + 77) > 0.6 ? '*' : '·'
      c.text(col, row, glyph, mix(0x55556a, 0xf2f2ff, (glow + 0.3) / 1.3))
    }
    // A big planet drifting slowly, with its moon.
    const px = c.w - 14 - ((f.t * 0.8) % 6)
    c.disc(Math.round(px), c.h - 7, 6, PLANET)
    c.disc(Math.round(px) + 2, 3, 2, MOON)
    // Asteroids sliding past.
    for (let i = 0; i < 10; i++) {
      const speed = 2 + hash(i + 40) * 5
      const x = (((hash(i) * c.w - f.t * speed) % c.w) + c.w) % c.w
      const y = Math.floor(hash(i + 20) * (c.h - 2))
      const size = hash(i + 60) > 0.7 ? 2 : 1
      c.rect(Math.round(x), y, size, size, ROCK[i % ROCK.length]!)
    }
    // Each tool call becomes a little bug drifting through the field.
    for (const h of f.happenings) {
      if (h.age > 14) continue
      const row = 1 + (h.seed % Math.max(1, c.rows - 2))
      const col = Math.round(c.cols - 4 - h.age * 5)
      c.text(col, row, `}o{ ${h.label}`, 0x9be39b)
    }
  },
  pose(c, f) {
    // Floating rather than walking.
    const span = Math.max(1, c.w - 40)
    const x = 6 + span / 2 + Math.sin(f.t * 0.35) * (span / 2)
    return {
      x: Math.round(x),
      y: Math.round(c.h / 2 - 3 + Math.sin(f.t * 1.6) * 1.5),
      flip: Math.cos(f.t * 0.35) < 0,
      step: (Math.floor(f.t * 3) % 2) as 0 | 1,
    }
  },
  lines: {
    read: ['Scanning sector {label}.', 'Pinging the asteroid field. One rock is {label}.'],
    bash: ['Firing thrusters: {label}.', 'Launch sequence {label}. Hold on.'],
    edit: ['Patching the hull at {label}.', 'Re-wiring {label} in zero gravity.'],
    think: ['Drifting. Thinking.', 'Space is big. So is this problem.', 'Charting a course.'],
  },
}
