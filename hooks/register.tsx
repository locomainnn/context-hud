import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, Project, ToolRun, Todo, Usage } from '../types'


const usageAtom = atom({ plugin: 'context-hud', key: 'usage' } as const, null, { shape: 'usage-1' })
const modelAtom = atom({ plugin: 'context-hud', key: 'model' } as const, '', { shape: 'model-1' })
const projectAtom = atom({ plugin: 'context-hud', key: 'project' } as const, null, { shape: 'project-1' })
const toolsAtom = atom({ plugin: 'context-hud', key: 'tools' } as const, [], { shape: 'tools-1' })
const agentsAtom = atom({ plugin: 'context-hud', key: 'agents' } as const, [], { shape: 'agents-1' })
const hiddenAtom = atom({ plugin: 'context-hud', key: 'hidden' } as const, false, { shape: 'hidden-1' })
const todosAtom = atom({ plugin: 'context-hud', key: 'todos' } as const, [], { shape: 'todos-1' })


const basename = (p: string) => p.split('/').filter(Boolean).pop() ?? p
const shortPath = (p: string, levels = 2) => p.split('/').filter(Boolean).slice(-levels).join('/') || '/'

function targetOf(e: Record<string, unknown>): string | undefined {
  const s = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : undefined)
  const file = s('file_path') ?? s('notebook_path')
  if (file) return basename(file)
  const cmd = s('command')
  if (cmd) return cmd.length > 40 ? cmd.slice(0, 40) + '…' : cmd
  const pat = s('pattern') ?? s('query') ?? s('url') ?? s('description') ?? s('skill')
  if (pat) return pat.length > 40 ? pat.slice(0, 40) + '…' : pat
  return undefined
}

function bar(percent: number, width = 20) {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
const levelColor = (p: number) => (p >= 85 ? 'error' : p >= 70 ? 'warning' : 'success')
const fmtTokens = (n?: number) =>
  n === undefined ? '?' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
function fmtDuration(ms: number) {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m >= 1 ? `${m}m` : '<1m'
}
function fmtReset(iso: string | undefined, now: number) {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!(ms > 0)) return ''
  return ` · reset ${fmtDuration(ms)}`
}
const limitLabel = (k: string) => (k === 'five_hour' ? '5u' : k === 'seven_day' ? '7d' : k)

async function refreshUsage($: any) {
  const u = await $.session.usage()
  const next: Usage = {
    percent: u.context.percent,
    tokens: u.context.tokens,
    window: u.context.window,
    limits: u.rateLimits.map((r: any) => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
    costUsd: u.cost?.usd,
    startedAt: u.startedAt,
  }
  await update($, usageAtom, () => next)
}

async function refreshAgents($: any) {
  const list = await $.agent.list()
  const rows: AgentRow[] = list.map((a: any) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    status: a.status,
    startTime: a.startTime,
    model: a.model,
  }))
  await update($, agentsAtom, () => rows.slice(-20))
}

async function refreshProject($: any) {
  const cwd: string = await $.session.cwd()
  let branch: string | undefined
  let isDirty: boolean | undefined
  try {
    const b = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    if (b.exitCode === 0) {
      branch = String(b.stdout).trim()
      const st = await $.process.run(['git', 'status', '--porcelain'], { cwd })
      isDirty = st.exitCode === 0 && String(st.stdout).trim().length > 0
    }
  } catch {
    branch = undefined
  }
  const p: Project = { cwd, branch, isDirty }
  await update($, projectAtom, () => p)
}

async function refreshAll($: any) {
  await Promise.allSettled([refreshUsage($), refreshAgents($)])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: 'Toggle the HUD bar above the prompt' })
    void Promise.allSettled([refreshAll($), refreshProject($)])
    return next(e)
  })

  on('command.run', { command: 'hud' }, async $ => {
    let nowHidden = false
    await update($, hiddenAtom, h => {
      nowHidden = !h
      return nowHidden
    })
    void refreshAll($)
    const surfaces = await $.session.surfaces()
    const where = surfaces.join(', ') || 'geen'
    const note = surfaces.includes('desktop') ? '' : ' (geen desktop-surface: de balk tekent alleen in de desktop app)'
    return { text: `${nowHidden ? 'HUD verborgen.' : 'HUD aan.'} Surfaces: ${where}${note}` }
  })

  on('turn.start', async ($, e, next) => {
    const out = await next(e)
    void refreshAll($)
    return out
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.usage?.model) void update($, modelAtom, () => e.usage!.model)
    void Promise.allSettled([refreshAll($), refreshProject($)])
    return out
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const todos: Todo[] = e.todos.map(t => ({ content: t.content, status: t.status, activeForm: t.activeForm }))
    await update($, todosAtom, () => todos)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const run: ToolRun = {
      id: e.tool_use_id,
      tool: e.tool,
      target: targetOf(e as unknown as Record<string, unknown>),
      isDone: false,
    }
    await update($, toolsAtom, list => [...list, run].slice(-100))
    const ran = await next(e)
    const isError = ran.deny !== undefined || ran.isError === true
    await update($, toolsAtom, list => list.map(t => (t.id === run.id ? { ...t, isDone: true, isError } : t)))
    void refreshAll($)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey || (await read($, hiddenAtom))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const [usage, model, project, tools, agents, todos] = await Promise.all([
      read($, usageAtom),
      read($, modelAtom),
      read($, projectAtom),
      read($, toolsAtom),
      read($, agentsAtom),
      read($, todosAtom),
    ])
    const now = await $.clock.now()
    const pct = usage?.percent ?? 0
    const sep = <Text dimColor> │ </Text>

    const running = tools.filter(t => !t.isDone)
    const counts = new Map<string, number>()
    for (const t of tools) if (t.isDone) counts.set(t.tool, (counts.get(t.tool) ?? 0) + 1)
    const topCounts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

    const liveAgents = agents.filter(a => a.status === 'running' || a.status === 'pending' || a.status === 'waiting')
    const doneTodos = todos.filter(t => t.status === 'completed').length
    const activeTodo = todos.find(t => t.status === 'in_progress')
    const showTodos = todos.length > 0 && doneTodos < todos.length

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color="claude" bold>
            [{model ? model.replace(/^claude-/, '') : '…'}]
          </Text>
          {project && (
            <>
              {sep}
              <Text>{shortPath(project.cwd, 1)}</Text>
              {project.branch && (
                <Text dimColor>
                  {' '}git:({project.branch}
                  {project.isDirty ? '*' : ''})
                </Text>
              )}
            </>
          )}
          {usage && (
            <>
              {sep}
              <Text mono color={levelColor(pct)}>
                {bar(pct, 10)} {usage.percent !== undefined ? `${usage.percent}%` : '—'}
              </Text>
              <Text dimColor> ({fmtTokens(usage.tokens)}/{fmtTokens(usage.window)})</Text>
              {usage.limits.map(l => (
                <>
                  {sep}
                  <Text color={levelColor(l.percentUsed)}>
                    {limitLabel(l.kind)} {l.percentUsed}%
                  </Text>
                  <Text dimColor>{fmtReset(l.resetsAt, now).replace(' · reset', ' ↻')}</Text>
                </>
              ))}
              {sep}
              <Text dimColor>⏱ {fmtDuration(now - usage.startedAt)}</Text>
            </>
          )}
        </Text>
        {(running.length > 0 || topCounts.length > 0) && (
          <Text wrap="truncate-end">
            {running.slice(-2).map(t => (
              <Text color="warning">
                ◐ {t.tool}
                {t.target ? <Text dimColor>: {t.target}</Text> : ''}
                {'  '}
              </Text>
            ))}
            <Text dimColor>{topCounts.map(([name, n]) => `✓ ${name} ×${n}`).join('  ')}</Text>
          </Text>
        )}
        {liveAgents.map(a => (
          <Text wrap="truncate-end">
            <Text color="warning">◐ {a.type}</Text>
            {a.model ? <Text dimColor> [{a.model.replace(/^claude-/, '')}]</Text> : ''}
            <Text>: {a.description}</Text>
            <Text dimColor> ({fmtDuration(now - a.startTime)})</Text>
          </Text>
        ))}
        {showTodos && (
          <Text wrap="truncate-end">
            <Text color="warning">▸ {activeTodo ? activeTodo.activeForm : 'Todo\'s'}</Text>
            <Text dimColor> ({doneTodos}/{todos.length})</Text>
          </Text>
        )}
      </Box>
    )
  })
}
