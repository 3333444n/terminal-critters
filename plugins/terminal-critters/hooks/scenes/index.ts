// Every scene in the rotation. To add one, write ./<id>.ts exporting a
// Scene and add it to this list (see CONTRIBUTING.md).

import type { Scene } from '../scene'
import { dungeon } from './dungeon'
import { factory } from './factory'
import { meadow } from './meadow'
import { ocean } from './ocean'
import { space } from './space'

export const SCENES: readonly Scene[] = [space, ocean, meadow, dungeon, factory]

export function sceneById(id: string): Scene | undefined {
  return SCENES.find(s => s.id === id)
}

/**
 * The scene for a new session, given the scenes recent sessions got (oldest
 * first): one they used least, and of those the one used longest ago, so
 * sessions open side by side look different.
 */
export function freshScene(recent: readonly string[]): Scene {
  const score = (s: Scene) => [recent.filter(id => id === s.id).length, recent.lastIndexOf(s.id)] as const
  const best = SCENES.map(score).reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a))
  const pool = SCENES.filter(s => {
    const [count, last] = score(s)
    return count === best[0] && last === best[1]
  })
  return pool[Math.floor(Math.random() * pool.length)] ?? SCENES[0]!
}

/** A random scene, avoiding the one just shown when there is a choice. */
export function randomScene(avoid?: string): Scene {
  const pool = SCENES.length > 1 ? SCENES.filter(s => s.id !== avoid) : SCENES
  return pool[Math.floor(Math.random() * pool.length)] ?? SCENES[0]!
}
