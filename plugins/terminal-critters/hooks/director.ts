// The director runs the show for one turn: which scene is on, what just
// happened, what the critter is saying, and how many helpers tag along.
// It knows nothing about Claude Code: register.ts feeds it events and asks
// it for frames, which keeps it easy to test.

import { Canvas, DEFAULT, hash } from './canvas'
import { lineFor, wrap } from './captions'
import { CRITTER_HEIGHT, CRITTER_WIDTH, drawCritter, drawHelper } from './critter'
import { pace, type Happening, type Scene, type SceneFrame, type WorkKind } from './scene'

/** How long a line stays up before a newer one may replace it. */
const HOLD_MS = 2600
/** Quiet this long and the critter starts musing. */
const MUSE_MS = 7000
/** A subagent counts as busy this long after its last tool call. */
const HELPER_MS = 25000

const BUBBLE_TEXT = 0xf6ebe3
const BUBBLE_FILL = 0x2a1714
const BUBBLE_EDGE = 0xd6c2b5

type Said = { text: string; at: number; kind: WorkKind }
type Seen = { kind: WorkKind; label: string; at: number; seed: number }

export class Director {
  scene: Scene
  private startedAt: number
  private frameNo = 0
  private seen: Seen[] = []
  private said: Said
  private pending: Seen | undefined
  private helpers = new Map<string, number>()
  private counter = 0

  constructor(scene: Scene, now: number) {
    this.scene = scene
    this.startedAt = now
    this.said = { text: lineFor(scene, 'think', '', Math.floor(hash(now) * 1000)), at: now, kind: 'think' }
  }

  /** Switches scene, keeping what has happened so far. */
  setScene(scene: Scene, now: number): void {
    this.scene = scene
    this.startedAt = now
  }

  /** A tool call happened. `agentId` is set when a subagent made it. */
  happen(kind: WorkKind, label: string, now: number, agentId?: string): void {
    if (agentId) this.helpers.set(agentId, now)
    const seen: Seen = { kind, label, at: now, seed: this.counter++ }
    this.seen = [seen, ...this.seen].slice(0, 6)
    // A subagent's calls make helpers busy; only the main loop's are narrated.
    if (agentId) return
    if (now - this.said.at >= HOLD_MS || this.said.kind === 'think') this.say(seen, now)
    else this.pending = seen
  }

  /** What the critter is saying right now. */
  saying(): string {
    return this.said.text
  }

  private say(seen: Seen, now: number): void {
    this.said = { text: lineFor(this.scene, seen.kind, seen.label, seen.seed * 7 + 3), at: now, kind: seen.kind }
    this.pending = undefined
  }

  private advance(now: number): void {
    if (this.pending && now - this.said.at >= HOLD_MS) this.say(this.pending, now)
    const last = this.seen[0]?.at ?? this.startedAt
    if (now - last >= MUSE_MS && now - this.said.at >= MUSE_MS) {
      this.said = { text: lineFor(this.scene, 'think', '', this.counter++), at: now, kind: 'think' }
    }
    for (const [id, at] of this.helpers) if (now - at > HELPER_MS) this.helpers.delete(id)
  }

  /** Draws one frame and packs it for a Raster. */
  frame(cols: number, rows: number, now: number): string {
    return this.canvas(cols, rows, now).pack()
  }

  /** Draws one frame onto a fresh canvas (tests read this). */
  canvas(cols: number, rows: number, now: number): Canvas {
    this.advance(now)
    const c = new Canvas(cols, rows)
    const f: SceneFrame = {
      t: (now - this.startedAt) / 1000,
      frame: this.frameNo++,
      happenings: this.seen.map(
        (s): Happening => ({ kind: s.kind, label: s.label, age: (now - s.at) / 1000, seed: s.seed }),
      ),
      helpers: this.helpers.size,
    }
    this.scene.draw(c, f)
    const pose = this.scene.pose?.(c, f) ?? pace(c, f, c.h - CRITTER_HEIGHT - 1)
    // Helpers trail behind the critter, a few pixels apart, bobbing out of step.
    for (let i = 0; i < Math.min(f.helpers, 4); i++) {
      const behind = (pose.flip ? 1 : -1) * (10 + i * 9)
      const bob = Math.round(Math.sin(f.t * 8 + i * 1.7))
      drawHelper(c, pose.x + (pose.flip ? CRITTER_WIDTH : 0) + behind, pose.y + CRITTER_HEIGHT - 4, pose.flip, bob)
    }
    // A quick blink every few seconds.
    c.clearText(pose.x, pose.y, CRITTER_WIDTH, CRITTER_HEIGHT)
    drawCritter(c, pose.x, pose.y, pose.flip, pose.step, now % 4200 < 170)
    this.scene.front?.(c, f)
    this.bubble(c, pose.x)
    return c
  }

  /** The speech bubble, beside the critter on whichever side has room. */
  private bubble(c: Canvas, critterX: number): void {
    const lines = wrap(this.said.text, Math.min(28, c.cols - 6), Math.max(1, Math.min(2, c.rows - 2)))
    if (lines.length === 0 || c.rows < 3) return
    const inner = Math.max(...lines.map(l => l.length)) + 2
    const width = inner + 2
    const leftRoom = critterX - 2
    const col =
      leftRoom >= width
        ? critterX - 1 - width
        : Math.min(critterX + CRITTER_WIDTH + 1, Math.max(0, c.cols - width))
    const row = 0
    c.text(col, row, '╭' + '─'.repeat(inner) + '╮', BUBBLE_EDGE, DEFAULT)
    lines.forEach((line, i) => {
      c.text(col, row + 1 + i, '│', BUBBLE_EDGE, DEFAULT)
      c.text(col + 1, row + 1 + i, ' ' + line.padEnd(inner - 1), BUBBLE_TEXT, BUBBLE_FILL)
      c.text(col + 1 + inner, row + 1 + i, '│', BUBBLE_EDGE, DEFAULT)
    })
    c.text(col, row + 1 + lines.length, '╰' + '─'.repeat(inner) + '╯', BUBBLE_EDGE, DEFAULT)
  }
}
