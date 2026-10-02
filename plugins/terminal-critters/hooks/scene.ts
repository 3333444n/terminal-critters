// The contract every scene follows. A scene is one file in ./scenes that
// exports a `Scene`; add it to the list in ./scenes/index.ts and it joins
// the rotation. See CONTRIBUTING.md for a walkthrough.

import type { Canvas } from './canvas'

/** What kind of work a tool call is, so scenes can react to it. */
export type WorkKind = 'read' | 'edit' | 'bash' | 'web' | 'agent' | 'plan' | 'think' | 'other'

/** One recent tool call, as a scene sees it. */
export type Happening = {
  kind: WorkKind
  /** A short word from the call: a file name, a command, a pattern. */
  label: string
  /** Seconds since it happened. */
  age: number
  /** A stable number per happening, for placing it. */
  seed: number
}

/** Everything a scene can read while drawing one frame. */
export type SceneFrame = {
  /** Seconds since the scene started. */
  t: number
  /** Frame counter. */
  frame: number
  /** The newest tool calls first, at most 6. */
  happenings: readonly Happening[]
  /** How many subagents look busy right now. */
  helpers: number
}

/** Where the critter stands this frame, in pixels. */
export type CritterPose = {
  x: number
  y: number
  /** True when it faces left. */
  flip: boolean
  /** Bobbing, walking, swimming: which sprite frame to use (0 or 1). */
  step: 0 | 1
}

export type Scene = {
  /** Lowercase id, what `/critters scene <id>` takes. */
  id: string
  /** A display name. */
  name: string
  /** Who made it, shown by `/critters list`. */
  author?: string
  /** Draws the background and props: everything except the critter and bubble. */
  draw: (c: Canvas, f: SceneFrame) => void
  /** Where the critter goes. Left out, it walks back and forth on the floor. */
  pose?: (c: Canvas, f: SceneFrame) => CritterPose
  /** Optional foreground drawn over the critter (waves, grass). */
  front?: (c: Canvas, f: SceneFrame) => void
  /**
   * What the critter says, per kind of work. `{label}` becomes the call's
   * label. Kinds left out use the shared lines in ./captions.ts.
   */
  lines?: Partial<Record<WorkKind, readonly string[]>>
}

/** The default pose: pace along the floor, turning at the edges. */
export function pace(c: Canvas, f: SceneFrame, floorY: number, speed = 6): CritterPose {
  const span = Math.max(1, c.w - 30)
  const d = (f.t * speed) % (span * 2)
  const forward = d < span
  return {
    x: 4 + (forward ? d : span * 2 - d),
    y: floorY,
    flip: !forward,
    step: (Math.floor(f.t * 6) % 2) as 0 | 1,
  }
}
