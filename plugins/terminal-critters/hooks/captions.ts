// The shared speech-bubble lines, used when a scene has none of its own for
// a kind of work. `{label}` becomes the tool call's label. Keep each line
// under ~56 characters: the bubble wraps at 28 and shows two lines.

import type { Scene, WorkKind } from './scene'

export const SHARED_LINES: Record<WorkKind, readonly string[]> = {
  read: [
    'Reading {label}. Taking notes.',
    'Peeking into {label}.',
    'Sniffing around {label} for clues.',
    'Following the trail through {label}.',
  ],
  edit: [
    'Nudging {label} into shape.',
    'Tidying up {label}.',
    'A careful snip in {label}.',
    'Rewriting {label}, one line at a time.',
  ],
  bash: [
    'Running {label}. Fingers crossed. All four legs too.',
    'Pulling the {label} lever.',
    'Asking the shell nicely: {label}.',
    '{label} is cooking.',
  ],
  web: [
    'Fetching {label} from the big ocean.',
    'Looking things up: {label}.',
    'Sending a message in a bottle to {label}.',
  ],
  agent: [
    'Calling in a helper for {label}.',
    'More hands on deck: {label}.',
    'A friend hops off to handle {label}.',
  ],
  plan: [
    'Updating the plan. Lists make me happy.',
    'Checking things off.',
    'Drawing a map before the trip.',
  ],
  think: [
    'Thinking very hard.',
    'Hmm.',
    'Connecting the dots.',
    'Pondering, quietly.',
    'One sec, it is all coming together.',
  ],
  other: ['Using {label}.', 'Poking at {label}.', 'Trying {label}.'],
}

/** Picks a line for this kind of work, preferring the scene's own lines. */
export function lineFor(scene: Scene, kind: WorkKind, label: string, seed: number): string {
  const own = scene.lines?.[kind]
  const pool = own && own.length > 0 ? own : SHARED_LINES[kind]
  const line = pool[Math.abs(seed) % pool.length] ?? ''
  return line.replaceAll('{label}', label || 'something')
}

/** Splits a line into at most `maxLines` lines of at most `width` characters. */
export function wrap(text: string, width: number, maxLines = 2): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= width) {
      line = next
      continue
    }
    if (line) out.push(line)
    line = word.length > width ? word.slice(0, width - 1) + '…' : word
    if (out.length === maxLines) break
  }
  if (line && out.length < maxLines) out.push(line)
  if (out.length > maxLines) out.length = maxLines
  return out
}
