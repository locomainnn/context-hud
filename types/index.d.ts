export type Usage = {
  percent?: number
  tokens?: number
  window: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  costUsd?: number
  startedAt: number
}
export type Project = { cwd: string; branch?: string; isDirty?: boolean }
export type ToolRun = { id: string; tool: string; target?: string; isDone: boolean; isError?: boolean }
export type AgentRow = { id: string; type: string; description: string; status: string; startTime: number; model?: string }
export type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }

declare module 'claude-code' {
  interface PluginState {
    'context-hud': {
      usage: Shaped<Usage | null>
      model: Shaped<string>
      project: Shaped<Project | null>
      tools: Shaped<ToolRun[]>
      agents: Shaped<AgentRow[]>
      todos: Shaped<Todo[]>
      hidden: Shaped<boolean>
    }
  }
}
