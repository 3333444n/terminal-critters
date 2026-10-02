// The critter: an unofficial, fan-made pixel homage to Claude's little
// orange mascot. Sprites are rows of characters; '.' is transparent. Each
// character is one pixel, and two pixel rows make one terminal row.

import type { Canvas } from './canvas'

export const CRITTER_PALETTE: Record<string, number> = {
  o: 0xd97757, // body
  k: 0x111111, // eyes
}

// Walking: the two leg pairs take turns lifting their last pixel.
const STEP_A = [
  '..oooooooooo..',
  '..ookooookoo..',
  'ooookooookoooo',
  'oooooooooooooo',
  '..oooooooooo..',
  '...o.o..o.o...',
  '...o.o..o.o...',
  '.....o....o...',
]

const STEP_B = [
  '..oooooooooo..',
  '..ookooookoo..',
  'ooookooookoooo',
  'oooooooooooooo',
  '..oooooooooo..',
  '...o.o..o.o...',
  '...o.o..o.o...',
  '...o....o.....',
]

// Blinking: the eyes squeeze to one pixel row.
const BLINK_TOP = [
  '..oooooooooo..',
  '..oooooooooo..',
  'ooookooookoooo',
  'oooooooooooooo',
  '..oooooooooo..',
]

export const CRITTER_WIDTH = STEP_A[0]!.length
export const CRITTER_HEIGHT = STEP_A.length

/** A helper: the small one that shows up for each busy subagent. */
const HELPER = ['.oooo.', 'okooko', '.oooo.', '.o..o.']

export function drawCritter(c: Canvas, x: number, y: number, flip: boolean, step: 0 | 1, blink = false): void {
  const legs = step === 0 ? STEP_A : STEP_B
  const rows = blink ? [...BLINK_TOP, ...legs.slice(BLINK_TOP.length)] : legs
  c.sprite(rows, x, y, CRITTER_PALETTE, flip)
}

export function drawHelper(c: Canvas, x: number, y: number, flip: boolean, bob: number): void {
  c.sprite(HELPER, x, y + bob, CRITTER_PALETTE, flip)
}
