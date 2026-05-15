import type { TaskStatus, WorkspaceAgent, WorkspaceMessage, WorkspaceTask } from '@renderer/store/workspace'

import type { AgentRunOptions } from './agentRunner'
import { runAgent } from './agentRunner'

export interface TaskSchedulerCallbacks {
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void
  onAgentRunning: (agentId: string, running: boolean) => void
  onAgentAction: (agentId: string, action: string) => void
  onAddMessage: (
    conversationId: string,
    message: Omit<WorkspaceMessage, 'roundNumber'> & { roundNumber?: number }
  ) => void
  onUpdateMessageContent: (conversationId: string, messageId: string, content: string) => void
  onAddEventMessage: (text: string) => void
}

export class TaskScheduler {
  private callbacks: TaskSchedulerCallbacks
  private runningAgents: Set<string> = new Set()
  private agentQueues: Map<string, string[]> = new Map()
  private aborted: boolean = false

  constructor(callbacks: TaskSchedulerCallbacks) {
    this.callbacks = callbacks
  }

  abort() {
    this.aborted = true
  }

  reset() {
    this.aborted = false
  }

  isAgentBusy(agentId: string): boolean {
    return this.runningAgents.has(agentId)
  }

  async executeTasks(
    tasks: WorkspaceTask[],
    agents: WorkspaceAgent[],
    conversationId: string,
    conversationHistory: any[],
    runOpts: Omit<AgentRunOptions, 'agent' | 'userMessage'>
  ): Promise<void> {
    this.reset()

    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const sorted = topologicalSort(tasks)

    for (const task of sorted) {
      if (this.aborted) break

      const agent = agents.find((a) => a.id === task.assignedTo)
      if (!agent) continue

      if (agent.status === 'paused') {
        this.callbacks.onTaskStatusChange(task.id, 'blocked')
        continue
      }

      if (!areDependenciesMet(task, taskMap)) {
        this.callbacks.onTaskStatusChange(task.id, 'blocked')
        continue
      }

      await this.enqueueAndWait(agent.id, task.id, async () => {
        if (this.aborted) return

        this.callbacks.onTaskStatusChange(task.id, 'in_progress')
        this.callbacks.onAgentAction(agent.id, `执行: ${task.title}`)
        this.callbacks.onAgentRunning(agent.id, true)

        const msgId = `task-${task.id}-${Date.now()}`
        this.callbacks.onAddMessage(conversationId, {
          id: msgId,
          agentId: agent.id,
          role: 'assistant',
          content: '',
          messageType: 'text',
          roundNumber: 0,
          createdAt: new Date().toISOString()
        })

        try {
          await runAgent({
            ...runOpts,
            agent,
            userMessage: `请执行任务: ${task.title}\n\n描述: ${task.description}`,
            conversationHistory,
            onChunk: (text) => {
              if (this.aborted) return
              this.callbacks.onUpdateMessageContent(conversationId, msgId, text)
            }
          })

          if (!this.aborted) {
            this.callbacks.onTaskStatusChange(task.id, 'completed')
            this.callbacks.onAddEventMessage(`✓ ${task.title} 完成`)
            wakeDependentTasks(task.id, taskMap, this.callbacks)
          }
        } catch (err: any) {
          if (!this.aborted) {
            this.callbacks.onTaskStatusChange(task.id, 'blocked')
            this.callbacks.onUpdateMessageContent(conversationId, msgId, `⚠️ 执行失败: ${err.message || '未知错误'}`)
            this.callbacks.onAddEventMessage(`✗ ${task.title} 失败: ${err.message}`)
          }
        } finally {
          this.callbacks.onAgentRunning(agent.id, false)
        }
      })
    }
  }

  private async enqueueAndWait(agentId: string, taskId: string, fn: () => Promise<void>): Promise<void> {
    if (!this.agentQueues.has(agentId)) {
      this.agentQueues.set(agentId, [])
    }

    const queue = this.agentQueues.get(agentId)!
    queue.push(taskId)

    while (queue[0] !== taskId) {
      await sleep(100)
      if (this.aborted) return
    }

    this.runningAgents.add(agentId)

    try {
      await fn()
    } finally {
      this.runningAgents.delete(agentId)
      queue.shift()
    }
  }
}

function areDependenciesMet(task: WorkspaceTask, taskMap: Map<string, WorkspaceTask>): boolean {
  return task.dependsOn.every((depId) => {
    const dep = taskMap.get(depId)
    return dep?.status === 'completed'
  })
}

function wakeDependentTasks(
  completedId: string,
  taskMap: Map<string, WorkspaceTask>,
  callbacks: TaskSchedulerCallbacks
) {
  for (const [, task] of taskMap) {
    if (task.status === 'blocked' && task.dependsOn.includes(completedId)) {
      if (areDependenciesMet(task, taskMap)) {
        callbacks.onTaskStatusChange(task.id, 'queued')
      }
    }
  }
}

function topologicalSort(tasks: WorkspaceTask[]): WorkspaceTask[] {
  const visited = new Set<string>()
  const result: WorkspaceTask[] = []
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const task = taskMap.get(id)
    if (!task) return
    for (const dep of task.dependsOn) {
      visit(dep)
    }
    result.push(task)
  }

  const sortedByPriority = [...tasks].sort((a, b) => {
    const p = { urgent: 0, high: 1, normal: 2 }
    return (p[a.priority] ?? 2) - (p[b.priority] ?? 2)
  })

  for (const task of sortedByPriority) {
    visit(task.id)
  }

  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
