// Turns a tool call into what the scenes react to: a kind of work and a
// short label (a file name, a command, a pattern). Nothing here leaves the
// machine; the label is only drawn in the scene.

import type { WorkKind } from './scene'

const KINDS: Record<string, WorkKind> = {
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  LS: 'read',
  NotebookRead: 'read',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'bash',
  BashOutput: 'bash',
  PowerShell: 'bash',
  Monitor: 'bash',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'agent',
  Task: 'agent',
  TodoWrite: 'plan',
  TaskCreate: 'plan',
  TaskUpdate: 'plan',
  EnterPlanMode: 'plan',
  ExitPlanMode: 'plan',
}

export function kindOf(tool: string): WorkKind {
  return KINDS[tool] ?? 'other'
}

const MAX = 14

function clip(s: string): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > MAX ? clean.slice(0, MAX - 1) + '…' : clean
}

function base(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** The word a Bash command is "about": the program after any cd/env prefix. */
function commandWord(command: string): string {
  const last = command.split(/&&|\|\||;|\|/).map(s => s.trim()).filter(Boolean)
  const pick = last.find(s => !/^(cd|export|set|source|\.)\b/.test(s)) ?? last[0] ?? command
  const words = pick.split(/\s+/).filter(w => !/^[A-Z_]+=/.test(w))
  const head = base(words[0] ?? '')
  // `npm test`, `git status`: the subcommand says more than the program.
  if (['npm', 'npx', 'pnpm', 'yarn', 'git', 'gh', 'cargo', 'go', 'docker', 'claude'].includes(head) && words[1]) {
    return `${head} ${words[1]}`
  }
  return head
}

/** A short label for a tool call, read from its arguments. */
export function labelOf(e: Record<string, unknown>): string {
  const tool = String(e.tool ?? '')
  const str = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
  if (str('file_path')) return clip(base(str('file_path')))
  if (str('notebook_path')) return clip(base(str('notebook_path')))
  if (tool === 'Bash' && str('command')) return clip(commandWord(str('command')))
  if (str('pattern')) return clip(str('pattern'))
  if (str('url')) {
    const host = /^https?:\/\/([^/]+)/.exec(str('url'))
    return clip(host?.[1] ? host[1].replace(/^www\./, '') : str('url'))
  }
  if (str('query')) return clip(str('query'))
  if (str('subagent_type')) return clip(str('subagent_type'))
  if (str('description')) return clip(str('description'))
  // An MCP tool: mcp__server__tool_name → tool_name.
  const short = tool.includes('__') ? tool.split('__').pop() ?? tool : tool
  return clip(short)
}
