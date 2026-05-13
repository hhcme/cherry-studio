import { fetchChatCompletion, hasApiKey } from '@renderer/services/ApiService'
import { getDefaultAssistant, getDefaultModel, getProviderByModel } from '@renderer/services/AssistantService'
import { getModelById } from '@renderer/services/ModelService'
import type { WorkspaceAgent, WorkspaceMessage } from '@renderer/store/workspace'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'

export interface AgentRunOptions {
  agent: WorkspaceAgent
  userMessage: string
  conversationHistory: WorkspaceMessage[]
  agents: WorkspaceAgent[]
  onChunk?: (text: string) => void
}

export interface AgentRunResult {
  content: string
  tasks?: Array<{ title: string; description: string; assignedTo: string }>
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const agentModel = opts.agent.modelId ? getModelById(opts.agent.modelId) : undefined
  const model = agentModel || getDefaultModel()
  if (!model) throw new Error('请先在设置中配置模型供应商和 API Key')

  const provider = getProviderByModel(model)
  if (!provider || !hasApiKey(provider)) {
    throw new Error('请先在设置中配置 API Key')
  }

  const assistant = getDefaultAssistant()
  assistant.model = model
  assistant.prompt = opts.agent.systemPrompt || buildDefaultPrompt(opts.agent, opts.agents)

  const sdkMessages = buildMessages(opts)

  let fullText = ''
  await fetchChatCompletion({
    messages: sdkMessages,
    assistant,
    onChunkReceived: (chunk: Chunk) => {
      if (chunk.type === ChunkType.TEXT_DELTA) {
        fullText = chunk.text
        opts.onChunk?.(fullText)
      }
    }
  })

  const tasks = extractTasks(fullText, opts.agents)

  return { content: fullText, tasks }
}

function buildDefaultPrompt(agent: WorkspaceAgent, allAgents: WorkspaceAgent[]): string {
  const teamDesc = allAgents
    .filter((a) => a.id !== agent.id)
    .map((a) => `- ${a.name}（${a.role}）`)
    .join('\n')

  if (agent.isMain) {
    return `你是 PM Agent（产品经理），负责协调项目中的 Agent 团队完成用户需求。

你的职责：
1. 理解用户需求，将其分解为可执行的任务
2. 将任务分发给合适的 Agent
3. 审核产出，处理冲突

团队成员：
${teamDesc || '（暂无其他 Agent）'}

回复格式：使用 Markdown。如果需要创建任务，请在回复末尾用以下 JSON 格式（用三个反引号+json 代码块包裹）：
{"tasks": [{"title": "任务标题", "description": "任务描述", "assignTo": "Agent名称"}]}`
  }

  return `你是 ${agent.name}（${agent.role}），负责根据 PM 分配的任务完成工作。
回复使用 Markdown 格式，代码使用语言标记的代码块。`
}

function buildMessages(opts: AgentRunOptions) {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  for (const msg of opts.conversationHistory.slice(-20)) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content })
    } else {
      const agent = opts.agents.find((a) => a.id === msg.agentId)
      messages.push({ role: 'assistant', content: `[${agent?.name || 'Agent'}] ${msg.content}` })
    }
  }

  messages.push({ role: 'user', content: opts.userMessage })

  return messages
}

function extractTasks(
  text: string,
  agents: WorkspaceAgent[]
): Array<{ title: string; description: string; assignedTo: string }> | undefined {
  const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```/)
  if (!jsonBlockMatch) return undefined

  try {
    const parsed = JSON.parse(jsonBlockMatch[1])
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      return parsed.tasks.map((t: any) => ({
        title: String(t.title || '未命名任务'),
        description: String(t.description || ''),
        assignedTo: resolveAgentId(String(t.assignTo || ''), agents)
      }))
    }
  } catch {
    return undefined
  }
  return undefined
}

function resolveAgentId(nameOrId: string, agents: WorkspaceAgent[]): string {
  const found = agents.find((a) => a.name.toLowerCase() === nameOrId.toLowerCase() || a.id === nameOrId)
  return found?.id || agents[0]?.id || ''
}
