# Contributing a scene

A scene is one TypeScript file that draws a little world for the critter to wander through. You don't need to know the rest of the code.

## 1. Set up

```bash
git clone https://github.com/3333444n/terminal-critters
cd terminal-critters
claude --plugin-dir ./plugins/terminal-critters
```

Claude Code reloads the mod every time you save. `/critters preview <your-scene>` shows it for 12 seconds without waiting for a turn.

## 2. Write the scene

Create `plugins/terminal-critters/hooks/scenes/<id>.ts`. This is a complete scene:

```ts
import { hash } from '../canvas'
import type { Scene } from '../scene'

export const snow: Scene = {
  id: 'snow',               // lowercase, what /critters scene <id> takes
  name: 'Snow Day',
  author: 'your-github-name',
  draw(c, f) {
    // Snowflakes falling: f.t is seconds since the scene started.
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(hash(i) * c.w)
      const y = Math.floor((f.t * 3 + hash(i + 100) * c.h) % c.h)
      c.set(x, y, 0xffffff)
    }
    // The ground.
    c.rect(0, c.h - 1, c.w, 1, 0xdfe8f0)
    // Each recent tool call, with its label.
    for (const h of f.happenings) {
      if (h.age > 10) continue
      c.text(4 + ((h.seed * 13) % Math.max(1, c.cols - 20)), 1, `* ${h.label}`, 0xa8d8ff)
    }
  },
  lines: {
    read: ['Digging {label} out of the snow.'],
    think: ['Brrr.', 'Building a snow-thought.'],
  },
}
```

Then add it to the list in `hooks/scenes/index.ts`:

```ts
import { snow } from './snow'
export const SCENES: readonly Scene[] = [space, ocean, meadow, dungeon, factory, snow]
```

## What you can draw with

The canvas `c` is `c.w` pixels wide and `c.h` pixels tall. Every terminal cell is two pixels stacked vertically, so there are also `c.cols` × `c.rows` cells for text.

| Call | Draws |
| --- | --- |
| `c.set(x, y, color)` | one pixel |
| `c.rect(x, y, w, h, color)` | a filled rectangle |
| `c.disc(cx, cy, r, color)` | a filled circle |
| `c.sprite(rows, x, y, palette, flip?)` | pixel art from rows of characters, e.g. `['.oo.', 'oooo']` with `{ o: 0xff8800 }`; `.` is transparent |
| `c.text(col, row, str, fg, bg?)` | text on whole cells (in cells, not pixels) |

Colors are `0xRRGGBB` numbers. Helpers in `canvas.ts`: `hash(n)` gives a stable random number in [0, 1) for a seed, and `mix(a, b, t)` blends two colors.

What `f` holds each frame:

| Field | Meaning |
| --- | --- |
| `f.t` | seconds since the scene started |
| `f.frame` | frame counter |
| `f.happenings` | the newest tool calls first: `{ kind, label, age, seed }`. `kind` is `read`, `edit`, `bash`, `web`, `agent`, `plan` or `other`. |
| `f.helpers` | how many subagents look busy |

Optional extras on a scene:

- `pose(c, f)` returns where the critter stands: `{ x, y, flip, step }`. Leave it out and the critter paces along the floor.
- `front(c, f)` draws over the critter (waves, tall grass).
- `lines` are the speech-bubble lines per kind of work. `{label}` becomes the tool call's label. Kinds you leave out use the shared lines in `captions.ts`.

## Rules for a scene

- **Pure drawing only.** A scene gets a canvas and numbers. No `$`, no files, no network. This keeps the mod's footprint tiny, so people can trust it.
- **Any size.** Your scene must look fine from 20 to 160 columns and 4 to 8 rows. The tests draw every scene at several sizes.
- **Keep it calm.** No full-screen flashing. Most of the band should stay the terminal's own background.
- **Original art.** Draw your own sprites for your scene. No logos, trademarks or other people's characters (the critter itself is the one fan-art exception, see the README).
- **Friendly lines.** Short (under ~56 characters) and kind.

## 3. Check it and open a PR

```bash
claude plugin validate plugins/terminal-critters
claude plugin test plugins/terminal-critters
```

Both must pass (CI runs them too). Add a screenshot of your scene to the PR description.
