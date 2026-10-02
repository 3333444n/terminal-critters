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

/** A random scene, avoiding the one just shown when there is a choice. */
export function randomScene(avoid?: string): Scene {
  const pool = SCENES.length > 1 ? SCENES.filter(s => s.id !== avoid) : SCENES
  return pool[Math.floor(Math.random() * pool.length)] ?? SCENES[0]!
}
