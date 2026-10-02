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
import { SCENES, randomScene, sceneById } from './scenes/index'
import { kindOf, labelOf } from './work'

const FRAME_MS = 66
/** Frames with nothing on screen before the timer stops itself. */
const IDLE_FRAMES = 45
const PREVIEW_MS = 12000
const MAX_ROWS = 8
const MIN_ROWS = 4
const MAX_COLS = 160

type Band = { requestId: string; cols: number; rows: number }
type Engine = EngineInterface

const HELP = [
  'terminal-critters: a pixel critter that keeps you company while Claude works.',
  '',
  '  /critters off            hide the critters (remembered across sessions)',
  '  /critters on             bring them back',
  '  /critters scene <name>   always use one scene; `auto` to rotate',
  '  /critters next           switch scene now',
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
  lastSceneId: undefined as string | undefined,
  band: undefined as Band | undefined,
  timer: undefined as { cancel: () => void } | undefined,
  idle: 0,
  denials: 0,
  previewUntil: 0,
  working: false,
}

function now(): number {
  return Date.now()
}

function previewing(): boolean {
  return now() < show.previewUntil
}

function startShow(): void {
  const scene = sceneById(show.pinned) ?? randomScene(show.lastSceneId)
  show.lastSceneId = scene.id
  show.director = new Director(scene, now())
}

function stopTimer(): void {
  show.timer?.cancel()
  show.timer = undefined
}

/** Repaints the band's Raster every frame; stops itself once nothing shows. */
function ensureTimer($: Engine): void {
  if (show.timer) return
  show.idle = 0
  show.timer = $.clock.every(FRAME_MS, () => {
    const { band, director } = show
    if (!band || !director) {
      if (++show.idle > IDLE_FRAMES) stopTimer()
      return
    }
    // A preview that ran out while idle: redraw so the band goes away.
    if (!show.working && !previewing()) {
      show.band = undefined
      $.ui.invalidate('ui.render')
      return
    }
    show.idle = 0
    const { requestId, cols, rows } = band
    void $.ui.blit({ requestId, key: 'scene', columns: cols, rows, cells: director.frame(cols, rows, now()) }).then(
      result => {
        // Not mounted any more (resized, collapsed): wait for the next render.
        if (result && 'deny' in result && result.deny) {
          if (++show.denials > 10) show.band = undefined
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
    await $.command.register({
      name: 'critters',
      description: 'Terminal critters: on, off, scene <name>, next, list, preview',
      argumentHint: '[on|off|scene <name>|next|list|preview]',
      immediate: true,
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // A turn already running (a subagent's) keeps the current show.
    if (!show.working) startShow()
    show.working = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) show.working = false
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    show.director?.happen(kindOf(e.tool), labelOf(e as unknown as Record<string, unknown>), now(), e.agentId)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    show.working = e.props.isWorking
    const visible = (show.working && !show.paused) || previewing()
    if (!visible || e.props.hasSurvey || e.surface !== 'terminal' || e.props.maxRows < MIN_ROWS + 1) {
      show.band = undefined
      return next(e)
    }
    if (!show.director) startShow()
    const cols = Math.max(20, Math.min(MAX_COLS, e.props.bodyColumns))
    const rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, e.props.maxRows - 1))
    show.band = { requestId: e.requestId, cols, rows }
    show.denials = 0
    ensureTimer($)

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
      return { text: ['Scenes:', ...rows, '', `Now: ${show.pinned === 'auto' ? 'auto (rotates each turn)' : show.pinned}`].join('\n') }
    }
    if (verb === 'scene') {
      if (arg !== 'auto' && !sceneById(arg)) {
        return { text: `No scene called "${arg}". Try one of: auto, ${SCENES.map(s => s.id).join(', ')}` }
      }
      show.pinned = arg
      await $.store.set('scene', arg)
      const scene = sceneById(arg)
      if (scene && show.director) show.director.setScene(scene, now())
      return { text: arg === 'auto' ? 'Scenes rotate each turn.' : `Scene set to ${scene!.name}.` }
    }
    if (verb === 'next') {
      const scene = randomScene(show.director?.scene.id)
      show.lastSceneId = scene.id
      if (show.director) show.director.setScene(scene, now())
      else show.director = new Director(scene, now())
      return { text: `Now showing ${scene.name}.` }
    }
    if (verb === 'preview') {
      const scene = arg ? sceneById(arg) : randomScene(show.director?.scene.id)
      if (!scene) return { text: `No scene called "${arg}". Try /critters list.` }
      show.director = new Director(scene, now())
      show.lastSceneId = scene.id
      show.previewUntil = now() + PREVIEW_MS
      redraw()
      ensureTimer($)
      return { text: `Previewing ${scene.name} for ${PREVIEW_MS / 1000} seconds.` }
    }
    return { text: `${HELP}\n\nStatus: ${show.paused ? 'off' : 'on'}, scene ${show.pinned}.` }
  })

  on('session.end', async ($, e, next) => {
    stopTimer()
    return next(e)
  })
}
