import { describe, expect, mock, test } from 'claude-code/testing'

import { Canvas } from '../hooks/canvas'
import { wrap } from '../hooks/captions'
import { Director } from '../hooks/director'
import { SCENES, freshScene } from '../hooks/scenes/index'
import { kindOf, labelOf } from '../hooks/work'

const PLUGIN = 'terminal-critters'

function bandProps(isWorking: boolean, bodyColumns = 100, maxRows = 12) {
  return {
    hasSurvey: false,
    isWorking,
    maxRows,
    bodyColumns,
    scroll: { offset: 0, bodyRows: maxRows },
    view: {},
  }
}

/** Packed cells decode to columns * rows * 3 u32 words. */
function wordCount(cells: string): number {
  const padding = cells.endsWith('==') ? 2 : cells.endsWith('=') ? 1 : 0
  return ((cells.length / 4) * 3 - padding) / 4
}

describe('scenes', () => {
  test('every scene draws a frame at several sizes without throwing', async () => {
    for (const scene of SCENES) {
      for (const [cols, rows] of [
        [20, 4],
        [80, 8],
        [160, 8],
      ] as const) {
        const d = new Director(scene, 0)
        d.happen('read', 'register.ts', 100)
        d.happen('bash', 'npm test', 200, 'agent-1')
        for (const t of [0, 1500, 9000, 30000]) {
          expect(wordCount(d.frame(cols, rows, t))).toBe(cols * rows * 3)
        }
      }
    }
  })

  test('scene ids are unique lowercase words', async () => {
    const ids = SCENES.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(/^[a-z][a-z0-9-]*$/.test(id)).toBe(true)
  })
})

describe('session scenes', () => {
  test('a new session gets a scene recent sessions used least', async () => {
    const ids = SCENES.map(s => s.id)
    expect(freshScene(ids.slice(0, -1)).id).toBe(ids.at(-1))
    // All used once: the one used longest ago.
    expect(freshScene([...ids.slice(1), ids[0]!]).id).toBe(ids[1])
    // Five sessions in a row from nothing all differ.
    const picked: string[] = []
    for (let i = 0; i < SCENES.length; i++) picked.push(freshScene(picked).id)
    expect(new Set(picked).size).toBe(SCENES.length)
  })
})

describe('director', () => {
  test('a tool call becomes the bubble line, with its label', async () => {
    const d = new Director(SCENES[0]!, 0)
    d.happen('edit', 'canvas.ts', 10)
    expect(d.saying()).toContain('canvas.ts')
  })

  test('a newer call waits until the current line has been up a while', async () => {
    const d = new Director(SCENES[0]!, 0)
    d.happen('edit', 'first.ts', 10)
    d.happen('read', 'second.ts', 500)
    expect(d.saying()).toContain('first.ts')
    d.canvas(80, 8, 4000)
    expect(d.saying()).toContain('second.ts')
  })

  test('helpers grow with busy agents but stop at five', async () => {
    const helperPixels = (agents: number) => {
      const d = new Director(SCENES[0]!, 0)
      d.setBusyAgents(agents)
      const c = d.canvas(160, 8, 1000)
      // Helper eyes sit in the body color; count body-colored pixels.
      let n = 0
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.get(x, y) === 0xd97757) n++
      return n
    }
    const base = helperPixels(0)
    const one = helperPixels(1) - base
    expect(one).toBeGreaterThan(0)
    expect(helperPixels(3) - base).toBe(one * 3)
    expect(helperPixels(5) - base).toBe(one * 5)
    expect(helperPixels(9)).toBe(helperPixels(5))
  })

  test('a helper leaves as soon as its agent is no longer running', async () => {
    const d = new Director(SCENES[0]!, 0)
    const helpers = () => {
      const c = d.canvas(160, 8, 1000)
      let n = 0
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.get(x, y) === 0xd97757) n++
      return n
    }
    d.setBusyAgents(0)
    const alone = helpers()
    // An agent's tool calls alone no longer keep a helper around.
    d.happen('bash', 'npm test', 500, 'agent-1')
    expect(helpers()).toBe(alone)
    d.setBusyAgents(3)
    const three = helpers()
    d.setBusyAgents(1)
    const one = helpers()
    expect(three).toBeGreaterThan(one)
    expect(one).toBeGreaterThan(alone)
    d.setBusyAgents(0)
    expect(helpers()).toBe(alone)
  })

  test('a subagent call is not narrated while the main loop works', async () => {
    const d = new Director(SCENES[0]!, 0)
    const before = d.saying()
    d.happen('bash', 'helper-cmd', 10, 'agent-7')
    expect(d.saying()).toBe(before)
  })
})

describe('work labels', () => {
  test('labels come from file names, commands and patterns', async () => {
    expect(labelOf({ tool: 'Read', file_path: '/a/b/register.ts' })).toBe('register.ts')
    expect(labelOf({ tool: 'Bash', command: 'cd /x && npm test -- --watch' })).toBe('npm test')
    expect(labelOf({ tool: 'Bash', command: 'FOO=1 python3 run.py' })).toBe('python3')
    expect(labelOf({ tool: 'WebFetch', url: 'https://www.example.com/a' })).toBe('example.com')
    expect(labelOf({ tool: 'mcp__server__do_thing' })).toBe('do_thing')
    expect(labelOf({ tool: 'Grep', pattern: 'a-very-long-search-pattern' }).length).toBeLessThan(15)
    expect(kindOf('Edit')).toBe('edit')
    expect(kindOf('Mystery')).toBe('other')
  })

  test('bubble text wraps to two lines', async () => {
    expect(wrap('one two three four five six seven eight nine ten', 12)).toEqual(['one two', 'three four'])
    expect(wrap('short', 12)).toEqual(['short'])
  })

  test('canvas text clips at the edges', async () => {
    const c = new Canvas(5, 2)
    c.text(3, 0, 'hello', 0xffffff)
    c.text(0, 5, 'off canvas', 0xffffff)
    expect(wordCount(c.pack())).toBe(5 * 2 * 3)
  })
})

describe('the band', () => {
  test('draws the scene while Claude works, on the terminal', async ($, on) => {
    on('agent.list', async () => ({ value: [] }))
    // Stands in for what Claude Code draws beneath the mod.
    on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => $$.ui.resolve(e).Box({ children: [] }))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(true) })
    const raster = await ui.find({ type: 'Raster', key: 'scene' })
    expect(raster).toBeDefined()
    expect(raster?.props.columns).toBe(100)
    expect(raster?.props.rows).toBe(8)
    await ui.unmount()
  })

  test('stays out of the way when idle, on desktop, or switched off', async ($, on) => {
    mock.store(on)
    on('agent.list', async () => ({ value: [] }))
    on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => $$.ui.resolve(e).Box({ children: [] }))

    const idle = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(false) })
    expect(await idle.find({ type: 'Raster' })).toBeUndefined()
    await idle.unmount()

    const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: bandProps(true) })
    expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
    await desktop.unmount()

    const off = await $.command.run({ command: 'critters', args: 'off' })
    expect(JSON.stringify(off)).toContain('napping')
    const paused = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(true) })
    expect(await paused.find({ type: 'Raster' })).toBeUndefined()
    await paused.unmount()

    await $.command.run({ command: 'critters', args: 'on' })
    const back = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(true) })
    expect(await back.find({ type: 'Raster' })).toBeDefined()
    await back.unmount()
  })

  test('stays up while a background agent runs after the main turn ends', async ($, on) => {
    mock.store(on)
    let agents = [{ id: 'a1', description: 'Research', type: 'general-purpose', status: 'running' }]
    on('agent.list', async () => ({ value: agents }))
    on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => $$.ui.resolve(e).Box({ children: [] }))

    const busy = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(false) })
    expect(await busy.find({ type: 'Raster', key: 'scene' })).toBeDefined()
    await busy.unmount()

    agents = [{ id: 'a1', description: 'Research', type: 'general-purpose', status: 'completed' }]
    const done = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(false) })
    expect(await done.find({ type: 'Raster' })).toBeUndefined()
    await done.unmount()
  })

  test('keeps moving after its timer was cut off while away', async ($, on) => {
    mock.store(on)
    on('agent.list', async () => ({ value: [] }))
    on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => $$.ui.resolve(e).Box({ children: [] }))
    // A clock whose periods resolve when the test ticks it, or are refused.
    let refuse = false
    let due: ((answer: object) => void)[] = []
    on('clock.every', async ($$, e, next) => new Promise<object>(resolve => {
      due.push(resolve)
      next.signal.addEventListener('abort', () => resolve({ deny: 'cancelled' }))
    }))
    const tick = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const now = due
        due = []
        for (const resolve of now) resolve(refuse ? { deny: 'away' } : { value: undefined })
        await new Promise(r => setTimeout(r, 5))
      }
    }
    let blits = 0
    on('ui.blit', async () => {
      blits++
      return { value: {} }
    })

    const before = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(true) })
    await tick(3)
    expect(blits).toBeGreaterThan(0)
    // Away: a refused period ends the interval.
    refuse = true
    await tick(1)
    refuse = false
    await before.unmount()

    // Back: the band draws again, and must animate again.
    blits = 0
    const after = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(true) })
    await tick(3)
    expect(blits).toBeGreaterThan(0)
    await after.unmount()
  })

  test('asks for a fresh render once its blits keep being denied', async ($, on) => {
    mock.store(on)
    on('agent.list', async () => ({ value: [] }))
    on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => $$.ui.resolve(e).Box({ children: [] }))
    const clock = mock.clock(on)
    let deny = false
    on('ui.blit', async () => ({ value: deny ? { deny: 'not mounted' } : {} }))
    let invalidates = 0
    on('ui.invalidate', async ($$, e, next) => {
      invalidates++
      return next(e)
    })

    const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(true) })
    await clock.advance(500)
    deny = true
    invalidates = 0
    await clock.advance(5000)
    expect(invalidates).toBeGreaterThan(0)
    await band.unmount()
  })

  test('a tiny band is left alone', async ($, on) => {
    on('agent.list', async () => ({ value: [] }))
    on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => $$.ui.resolve(e).Box({ children: [] }))
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(true, 100, 3) })
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    await ui.unmount()
  })

  test('each session keeps one scene, different from the session before', async ($, on) => {
    mock.store(on)
    let sessionId = 's1'
    on('session.id', async () => ({ value: sessionId }))
    on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', async () => ({ text: '' }))
    on('agent.list', async () => ({ value: [] }))
    on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => $$.ui.resolve(e).Box({ children: [] }))
    const shown = async () => {
      const text = JSON.stringify(await $.command.run({ command: 'critters', args: '' }))
      return /last shown ([A-Za-z ]+)\./.exec(text)?.[1]
    }
    const turns = async (ids: string[]) => {
      const seen: (string | undefined)[] = []
      for (const turnId of ids) {
        // The band redraws as working before turn.start arrives, as in a session.
        const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: bandProps(true) })
        await band.unmount()
        await $.turn.start({ text: 'do work', turnId })
        seen.push(await shown())
        await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId } as never)
      }
      return seen
    }

    const first = await turns(['t1', 't2', 't3'])
    expect(first[0]).toBeDefined()
    expect(new Set(first).size).toBe(1)

    // A /clear goes on under a new session id: a new session, another scene.
    sessionId = 's2'
    const second = await turns(['t4', 't5'])
    expect(second[0]).toBeDefined()
    expect(new Set(second).size).toBe(1)
    expect(second[0]).not.toBe(first[0])

    // Back to the first session (a resume): its scene again.
    sessionId = 's1'
    expect((await turns(['t6']))[0]).toBe(first[0])
  })

  test('/critters next gives this session another scene, and it stays', async ($, on) => {
    mock.store(on)
    on('session.id', async () => ({ value: 's1' }))
    on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
    const before = JSON.stringify(await $.command.run({ command: 'critters', args: 'list' }))
    const next = JSON.stringify(await $.command.run({ command: 'critters', args: 'next' }))
    const name = /Now showing ([A-Za-z ]+)\./.exec(next)?.[1]
    expect(name).toBeDefined()
    expect(before).not.toContain(`this session: ${name}`)
    await $.turn.start({ text: 'do work', turnId: 't1' })
    expect(JSON.stringify(await $.command.run({ command: 'critters', args: '' }))).toContain(`last shown ${name}.`)
  })

  test('/critters answers list, scene and unknown names', async ($, on) => {
    mock.store(on)
    const list = JSON.stringify(await $.command.run({ command: 'critters', args: 'list' }))
    for (const s of SCENES) expect(list).toContain(s.id)
    expect(JSON.stringify(await $.command.run({ command: 'critters', args: 'scene ocean' }))).toContain('Deep Dive')
    expect(JSON.stringify(await $.command.run({ command: 'critters', args: 'scene nope' }))).toContain('No scene')
    expect(JSON.stringify(await $.command.run({ command: 'critters', args: '' }))).toContain('/critters off')
  })
})
