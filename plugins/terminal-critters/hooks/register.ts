// terminal-critters: a little pixel critter and its scenes in the band above the
// prompt while Claude works.
//
// How it fits together:
//   tool.call       feeds the director what Claude is doing
//   ui.render       draws the band (AbovePrompt) as one Raster while a turn runs
//   $.clock.every   repaints that Raster with $.ui.blit, ~15 frames a second,
//                   and stops itself once nothing is on screen
//   /critters       on, off, scene, list, preview, next
//
// It reads no files, makes no network calls and calls no model.

import type { EngineInterface, Register } from 'claude-code'

import { Director } from './director'
import type { Scene } from './scene'
import { SCENES, freshScene, randomScene, sceneById } from './scenes/index'
import { kindOf, labelOf } from './work'

const FRAME_MS = 66
/** Frames with nothing on screen before the timer stops itself. */
const IDLE_FRAMES = 45
/** Denied blits in a row before the timer stops painting and asks for a render. */
const MAX_DENIALS = 10
const PREVIEW_MS = 12000
const MAX_ROWS = 8
const MIN_ROWS = 4
const MAX_COLS = 160
/** How many sessions' scenes the store remembers. */
const SESSIONS_KEPT = 40
/** How many of the latest sessions a new one avoids looking like. */
const RECENT_SESSIONS = 8

type Band = { requestId: string; cols: number; rows: number }
/** A session and the scene it was given, as the store keeps them. */
type SessionScene = { id: string; scene: string }
type Engine = EngineInterface

const HELP = [
  'terminal-critters: a pixel critter that keeps you company while Claude works.',
  '',
  '  /critters off            hide the critters (remembered across sessions)',
  '  /critters on             bring them back',
  '  /critters scene <name>   always use one scene; `auto`: one per session',
  '  /critters next           give this session another scene',
  '  /critters list           list the scenes',
  '  /critters preview [name] show a scene for 12 seconds, even when idle',
  '',
  'To remove it completely: /plugin, then disable or uninstall terminal-critters.',
].join('\n')

// The show's state. Module variables start over when the mod reloads.
const show = {
  paused: false,
  pinned: 'auto',
  director: undefined as Director | undefined,
  /** This session and its scene, once looked up. */
  session: undefined as SessionScene | undefined,
  band: undefined as Band | undefined,
  timer: undefined as { cancel: () => void } | undefined,
  idle: 0,
  denials: 0,
  previewUntil: 0,
  working: false,
  /** True between the main loop's turn.start and its turn.complete. */
  turnOpen: false,
  /** Agents Claude Code lists as running (background agents keep the show on). */
  agents: 0,
  frames: 0,
}

/** Agent statuses that count as still working. */
const BUSY = new Set(['running', 'pending'])
/** How often, in frames, the timer re-counts running agents while the main loop is idle. */
const AGENT_POLL_FRAMES = 15

/** Counts the agents still running, and tells the director. */
async function countAgents($: Engine): Promise<number> {
  const list = await $.agent.list()
  show.agents = list.filter(a => BUSY.has(a.status)).length
  show.director?.setBusyAgents(show.agents)
  return show.agents
}

/** True while there is work to keep the critter company. */
function busy(): boolean {
  return show.working || show.agents > 0
}

function now(): number {
  return Date.now()
}

function previewing(): boolean {
  return now() < show.previewUntil
}

function isSessionScene(v: unknown): v is SessionScene {
  return typeof v === 'object' && v !== null && typeof (v as SessionScene).id === 'string' && typeof (v as SessionScene).scene === 'string'
}

/** The sessions the store remembers, oldest first. */
async function readSessions($: Engine): Promise<SessionScene[]> {
  const saved = await $.store.get('sessions')
  return Array.isArray(saved) ? saved.filter(isSessionScene) : []
}

/** Gives the session `id` the scene `scene`, remembered across reloads and resumes. */
async function rememberScene($: Engine, id: string, scene: string): Promise<void> {
  const sessions = (await readSessions($)).filter(s => s.id !== id)
  sessions.push({ id, scene })
  await $.store.set('sessions', sessions.slice(-SESSIONS_KEPT))
  show.session = { id, scene }
}

/**
 * This session's scene: the one it was given before, or one that recent
 * sessions used least, so each session can be told apart by its scene.
 */
async function sessionScene($: Engine): Promise<Scene> {
  // Asked every time: a /clear goes on under a new session id.
  const id = await $.session.id()
  const cached = show.session?.id === id ? sceneById(show.session.scene) : undefined
  if (cached) return cached
  const sessions = await readSessions($)
  const known = sceneById(sessions.find(s => s.id === id)?.scene ?? '')
  if (known) {
    show.session = { id, scene: known.id }
    return known
  }
  const fresh = freshScene(sessions.slice(-RECENT_SESSIONS).map(s => s.scene))
  await rememberScene($, id, fresh.id)
  return fresh
}

async function startShow($: Engine): Promise<void> {
  // Without the session's id or the store, any scene beats no critter.
  const scene = sceneById(show.pinned) ?? (await sessionScene($).catch(() => randomScene()))
  show.director = new Director(scene, now())
}

function stopTimer(): void {
  show.timer?.cancel()
  show.timer = undefined
}

/**
 * (Re)starts the timer that repaints the band's Raster every frame; it stops
 * itself once nothing shows. Every render starts it afresh: the engine ends an
 * interval for good when it refuses one of its periods (as it can while the
 * terminal is in the background), and a render is the band coming back.
 */
function startTimer($: Engine): void {
  stopTimer()
  show.idle = 0
  show.timer = $.clock.every(FRAME_MS, () => {
    show.frames++
    const { band, director } = show
    if (!band || !director) {
      if (++show.idle > IDLE_FRAMES) stopTimer()
      return
    }
    // Re-count running agents about once a second, so a finished agent's
    // helper leaves; with the main loop idle, redraw once the last one (and
    // any preview) is done so the band goes away.
    if (show.frames % AGENT_POLL_FRAMES === 0) {
      void countAgents($).then(n => {
        if (n === 0 && !show.working && !previewing()) {
          show.band = undefined
          $.ui.invalidate('ui.render')
        }
      })
    }
    if (!busy() && !previewing()) {
      show.band = undefined
      $.ui.invalidate('ui.render')
      return
    }
    show.idle = 0
    // Not mounted (the terminal redrew, resized, collapsed the band): try only
    // about once a second, and ask for a fresh render each time, so the band
    // that comes back gets a Raster this timer can reach again.
    if (show.denials >= MAX_DENIALS && show.frames % AGENT_POLL_FRAMES !== 0) return
    const { requestId, cols, rows } = band
    void $.ui.blit({ requestId, key: 'scene', columns: cols, rows, cells: director.frame(cols, rows, now()) }).then(
      result => {
        if (result && 'deny' in result && result.deny) {
          if (++show.denials >= MAX_DENIALS) $.ui.invalidate('ui.render')
        } else show.denials = 0
      },
    )
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    show.paused = (await $.store.get('paused')) === true
    const saved = await $.store.get('scene')
    show.pinned = typeof saved === 'string' && (saved === 'auto' || sceneById(saved)) ? saved : 'auto'
    // Pick this session's scene now, so sessions opened together differ.
    await sessionScene($).catch(() => undefined)
    await $.command.register({
      name: 'critters',
      description: 'Terminal critters: on, off, scene <name>, next, list, preview',
      argumentHint: '[on|off|scene <name>|next|list|preview]',
      immediate: true,
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // New work, a fresh show in this session's scene. A turn starting while
    // one is open (a subagent's) keeps the current show.
    if (!show.turnOpen) await startShow($)
    show.turnOpen = true
    show.working = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      show.turnOpen = false
      show.working = false
    } else {
      // An agent finished its turn: its helper can leave right away.
      void countAgents($)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!show.director) await startShow($)
    // While the main loop is idle, the critter narrates what the agents do.
    const narrate = !e.agentId || !show.working
    show.director?.happen(kindOf(e.tool), labelOf(e as unknown as Record<string, unknown>), now(), e.agentId, narrate)
    if (e.agentId) {
      // A new agent gets its helper right away instead of at the next count.
      void countAgents($)
      // An agent working while the band is hidden: draw it again.
      if (!show.band && !show.paused) $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    show.working = e.props.isWorking
    await countAgents($)
    const visible = (busy() && !show.paused) || previewing()
    if (!visible || e.props.hasSurvey || e.surface !== 'terminal' || e.props.maxRows < MIN_ROWS + 1) {
      show.band = undefined
      return next(e)
    }
    if (!show.director) await startShow($)
    const cols = Math.max(20, Math.min(MAX_COLS, e.props.bodyColumns))
    const rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, e.props.maxRows - 1))
    show.band = { requestId: e.requestId, cols, rows }
    show.denials = 0
    startTimer($)

    const { Box, Raster } = $.ui.resolve(e)
    const scene = Raster({ key: 'scene', columns: cols, rows, cells: show.director!.frame(cols, rows, now()) })
    // Keep whatever other mods draw in the band, under the scene.
    const others = await next(e)
    return Box({ flexDirection: 'column', children: others ? [scene, others] : [scene] })
  })

  on('command.run', { command: 'critters' }, async ($, e) => {
    const [verb = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)
    const redraw = () => $.ui.invalidate('ui.render')

    if (verb === 'off') {
      show.paused = true
      await $.store.set('paused', true)
      redraw()
      return { text: 'Critters are napping. /critters on wakes them up.' }
    }
    if (verb === 'on') {
      show.paused = false
      await $.store.set('paused', false)
      redraw()
      return { text: 'Critters are back. They show up while Claude works.' }
    }
    if (verb === 'list') {
      const rows = SCENES.map(s => `  ${s.id.padEnd(10)} ${s.name}${s.author ? `  (by ${s.author})` : ''}`)
      const auto = `auto (this session: ${show.session ? sceneById(show.session.scene)?.name : 'not picked yet'})`
      return { text: ['Scenes:', ...rows, '', `Now: ${show.pinned === 'auto' ? auto : show.pinned}`].join('\n') }
    }
    if (verb === 'scene') {
      if (arg !== 'auto' && !sceneById(arg)) {
        return { text: `No scene called "${arg}". Try one of: auto, ${SCENES.map(s => s.id).join(', ')}` }
      }
      show.pinned = arg
      await $.store.set('scene', arg)
      const scene = sceneById(arg) ?? (await sessionScene($).catch(() => randomScene()))
      if (show.director) show.director.setScene(scene, now())
      return { text: arg === 'auto' ? `Each session keeps its own scene; this one has ${scene.name}.` : `Scene set to ${scene.name}.` }
    }
    if (verb === 'next') {
      const scene = randomScene(show.director?.scene.id ?? show.session?.scene)
      await rememberScene($, await $.session.id(), scene.id)
      if (show.director) show.director.setScene(scene, now())
      else show.director = new Director(scene, now())
      return { text: `Now showing ${scene.name}.` }
    }
    if (verb === 'preview') {
      const scene = arg ? sceneById(arg) : randomScene(show.director?.scene.id)
      if (!scene) return { text: `No scene called "${arg}". Try /critters list.` }
      show.director = new Director(scene, now())
      show.previewUntil = now() + PREVIEW_MS
      redraw()
      startTimer($)
      return { text: `Previewing ${scene.name} for ${PREVIEW_MS / 1000} seconds.` }
    }
    const current = show.director ? `, last shown ${show.director.scene.name}` : ''
    return { text: `${HELP}\n\nStatus: ${show.paused ? 'off' : 'on'}, scene ${show.pinned}${current}.` }
  })

  on('session.end', async ($, e, next) => {
    stopTimer()
    return next(e)
  })
}
