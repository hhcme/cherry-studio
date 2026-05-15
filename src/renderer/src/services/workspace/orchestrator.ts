import type {
  MessageRole,
  MessageType,
  TaskPriority,
  TaskStatus,
  WorkspaceAgent,
  WorkspaceMessage,
  WorkspaceTask
} from '@renderer/store/workspace'
import { MAX_ROUNDS } from '@renderer/store/workspace'

import { runAgent } from './agentRunner'
import { TaskScheduler } from './taskScheduler'

const SOFT_ROUND_CAP = 20

export interface OrchestratorCallbacks {
  dispatch: (action: any) => void
  addMessage: (payload: {
    conversationId: string
    message: Partial<WorkspaceMessage> & {
      id: string
      role: MessageRole
      content: string
      messageType: MessageType
      createdAt: string
    }
  }) => any
  updateMessageContent: (conversationId: string, messageId: string, content: string) => void
  createTask: (task: {
    title: string
    description: string
    assignedTo: string
    conversationId: string
    priority?: TaskPriority
    dependsOn?: string[]
    _taskId?: string
  }) => any
  updateTaskStatus: (payload: { taskId: string; status: TaskStatus }) => any
  setAgentRunning: (payload: { agentId: string; running: boolean }) => any
  setAgentAction: (payload: { agentId: string; action: string }) => any
  startNewRound: () => any
  completeRound: () => any
  forceTerminate: () => any
  setError: (error: string | null) => void
}

interface OrchestratorContext {
  conversationId: string
  agents: WorkspaceAgent[]
  conversationHistory: WorkspaceMessage[]
  existingTasks: WorkspaceTask[]
  roundCount: number
  apiServer?: any
  agentMapping: Record<string, { agentId: string; sessionId: string }>
  knowledgeBaseId?: string
  workDir?: string
}

export class Orchestrator {
  private cb: OrchestratorCallbacks
  private aborted = false
  private scheduler: TaskScheduler | null = null
  private isRunning = false

  constructor(callbacks: OrchestratorCallbacks) {
    this.cb = callbacks
  }

  abort() {
    this.aborted = true
    this.scheduler?.abort()
  }

  get running() {
    return this.isRunning
  }

  private dispatchedTasks: Array<{ id: string; title: string; assignedTo: string }> = []

  async runRound(userText: string, ctx: OrchestratorContext): Promise<void> {
    if (this.isRunning) {
      console.warn('[Orchestrator] runRound called while already running, ignoring')
      return
    }
    this.isRunning = true
    this.aborted = false

    try {
      const { conversationId, agents, roundCount } = ctx

      if (roundCount >= MAX_ROUNDS) {
        this.cb.setError(`已达到最大轮次 (${MAX_ROUNDS})，对话已终止`)
        this.cb.dispatch(this.cb.forceTerminate())
        return
      }

      if (roundCount >= SOFT_ROUND_CAP) {
        this.addSystemMessage(
          conversationId,
          `⚠️ 已进行 ${roundCount} 轮对话（软上限 ${SOFT_ROUND_CAP}），请考虑总结或终止`
        )
      }

      this.cb.dispatch(this.cb.startNewRound())
      const currentRound = roundCount + 1

      const pmAgent = agents.find((a) => a.isMain) || agents[0]
      if (!pmAgent) return

      const subAgents = agents.filter((a) => a.id !== pmAgent.id)

      try {
        this.cb.dispatch(this.cb.setAgentRunning({ agentId: pmAgent.id, running: true }))
        this.cb.dispatch(this.cb.setAgentAction({ agentId: pmAgent.id, action: '正在分析需求...' }))
        this.cb.setError(null)

        const pmMsgId = `msg-${Date.now()}-pm`
        this.cb.dispatch(
          this.cb.addMessage({
            conversationId,
            message: {
              id: pmMsgId,
              agentId: pmAgent.id,
              role: 'assistant',
              content: '正在分析需求...',
              messageType: 'text',
              createdAt: new Date().toISOString(),
              roundNumber: currentRound
            }
          })
        )

        let pmResult: { content: string; tasks?: any[] }
        try {
          pmResult = await this.runPMAgent(pmAgent, userText, ctx, pmMsgId)
        } catch (err: any) {
          this.cb.updateMessageContent(conversationId, pmMsgId, `⚠️ PM 分析失败: ${err.message || '未知错误'}`)
          this.cb.dispatch(this.cb.setAgentRunning({ agentId: pmAgent.id, running: false }))
          this.cb.dispatch(this.cb.completeRound())
          return
        }

        this.cb.dispatch(this.cb.setAgentRunning({ agentId: pmAgent.id, running: false }))

        if (this.aborted) return

        const tasks = pmResult.tasks || []
        const analysisText = this.stripTaskJSON(pmResult.content)

        if (tasks.length > 0) {
          this.cb.updateMessageContent(conversationId, pmMsgId, analysisText || '已完成需求分析，正在分派任务...')
          this.dispatchTasks(conversationId, tasks, currentRound)
        } else if (!analysisText && !pmResult.content) {
          this.cb.updateMessageContent(conversationId, pmMsgId, 'PM 暂无回复')
        } else {
          this.cb.updateMessageContent(conversationId, pmMsgId, analysisText || pmResult.content || '暂无分析结果')
        }

        if (this.shouldTerminate(pmResult.content, subAgents, tasks)) {
          this.addSystemMessage(conversationId, 'PM 判断本轮任务已完成，结束当前轮次')
          this.cb.dispatch(this.cb.completeRound())
          return
        }

        if (subAgents.length === 0 || tasks.length === 0) {
          this.cb.dispatch(this.cb.completeRound())
          return
        }

        await this.executeSubAgentTasks(ctx, currentRound)

        this.cb.dispatch(this.cb.completeRound())
      } catch (err: any) {
        this.cb.setError(err.message || '调用失败，请检查 API 配置')
        for (const a of agents) {
          this.cb.dispatch(this.cb.setAgentRunning({ agentId: a.id, running: false }))
        }
        this.cb.dispatch(this.cb.completeRound())
      }
    } finally {
      this.isRunning = false
    }
  }

  private async runPMAgent(pmAgent: WorkspaceAgent, userText: string, ctx: OrchestratorContext, msgId: string) {
    return runAgent({
      agent: pmAgent,
      userMessage: userText,
      conversationHistory: ctx.conversationHistory,
      agents: ctx.agents,
      apiServer: ctx.apiServer,
      agentMapping: ctx.agentMapping,
      knowledgeBaseId: ctx.knowledgeBaseId,
      workDir: ctx.workDir || pmAgent.workDir,
      onChunk: (text) => {
        if (this.aborted) return
        this.cb.updateMessageContent(ctx.conversationId, msgId, text)
      }
    })
  }

  private dispatchTasks(
    conversationId: string,
    tasks: Array<{ title: string; description: string; assignedTo: string }>,
    roundNumber: number
  ) {
    for (const t of tasks) {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      this.dispatchedTasks.push({ id: taskId, title: t.title, assignedTo: t.assignedTo })
      this.cb.dispatch(
        this.cb.createTask({
          title: t.title,
          description: t.description,
          assignedTo: t.assignedTo,
          conversationId,
          _taskId: taskId
        })
      )
      this.addSystemMessage(conversationId, `创建任务: ${t.title}`, roundNumber, 'task_create', {
        taskId,
        title: t.title,
        status: 'queued' as TaskStatus,
        assignedTo: t.assignedTo
      })
    }
  }

  private async executeSubAgentTasks(ctx: OrchestratorContext, roundNumber: number): Promise<void> {
    const { conversationId, agents, conversationHistory, existingTasks } = ctx

    const mergedTasks = [...existingTasks.filter((t) => t.conversationId === conversationId)]
    for (const dt of this.dispatchedTasks) {
      if (!mergedTasks.find((t) => t.id === dt.id)) {
        mergedTasks.push({
          id: dt.id,
          title: dt.title,
          description: '',
          status: 'queued',
          priority: 'normal',
          conversationId,
          assignedTo: dt.assignedTo,
          dependsOn: [],
          createdAt: new Date().toISOString()
        })
      }
    }

    this.scheduler = new TaskScheduler({
      onTaskStatusChange: (taskId, status) => {
        this.cb.dispatch(this.cb.updateTaskStatus({ taskId, status }))
        const task = mergedTasks.find((t) => t.id === taskId)
        if (task) {
          this.addSystemMessage(conversationId, `${task.title} → ${status}`, roundNumber, 'task_update', {
            taskId: task.id,
            title: task.title,
            status,
            assignedTo: task.assignedTo
          })
        }
      },
      onAgentRunning: (agentId, running) => {
        this.cb.dispatch(this.cb.setAgentRunning({ agentId, running }))
      },
      onAgentAction: (agentId, action) => {
        this.cb.dispatch(this.cb.setAgentAction({ agentId, action }))
      },
      onAddMessage: (convId, message) => {
        const msg = {
          ...message,
          roundNumber: message.roundNumber ?? roundNumber
        }
        this.cb.dispatch(this.cb.addMessage({ conversationId: convId, message: msg as any }))
      },
      onUpdateMessageContent: (convId, messageId, content) => {
        this.cb.updateMessageContent(convId, messageId, content)
      },
      onAddEventMessage: (text) => {
        this.addSystemMessage(conversationId, text, roundNumber)
      }
    })

    await this.scheduler.executeTasks(mergedTasks, agents, conversationId, conversationHistory, {
      agents,
      conversationHistory,
      apiServer: ctx.apiServer,
      agentMapping: ctx.agentMapping,
      knowledgeBaseId: ctx.knowledgeBaseId,
      workDir: ctx.workDir
    })

    this.scheduler = null
    this.dispatchedTasks = []
  }

  private shouldTerminate(
    pmContent: string,
    subAgents: WorkspaceAgent[],
    tasks: Array<{ title: string; description: string; assignedTo: string }>
  ): boolean {
    if (subAgents.length === 0) return true
    if (tasks.length > 0) return false

    const terminationSignals = [
      /无需.*操作/,
      /无需.*任务/,
      /不需要.*处理/,
      /已经.*解决/,
      /no further/i,
      /all done/i,
      /nothing.*to.*do/i
    ]

    const lower = pmContent.toLowerCase()
    for (const pattern of terminationSignals) {
      if (pattern.test(lower)) return true
    }

    return false
  }

  private stripTaskJSON(text: string): string {
    return text
      .replace(/```json\s*\n?[\s\S]*?\n?```/g, '')
      .replace(/```\s*\n?\{[\s\S]*?"tasks"[\s\S]*?\}\n?```/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private addSystemMessage(
    conversationId: string,
    text: string,
    roundNumber: number = 0,
    messageType: MessageType = 'text',
    taskData?: { taskId: string; title: string; status: TaskStatus; assignedTo: string }
  ) {
    this.cb.dispatch(
      this.cb.addMessage({
        conversationId,
        message: {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          agentId: 'system',
          role: 'system',
          content: text,
          messageType,
          createdAt: new Date().toISOString(),
          roundNumber,
          taskData
        }
      })
    )
  }
}
