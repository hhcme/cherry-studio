import { fetchChatCompletion, hasApiKey } from '@renderer/services/ApiService'
import { getDefaultAssistant, getDefaultModel, getProviderByModel } from '@renderer/services/AssistantService'
import { getModelById } from '@renderer/services/ModelService'
import type { WorkspaceAgent, WorkspaceMessage } from '@renderer/store/workspace'
import type { ApiServerConfig } from '@renderer/types/apiServer'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'

export interface AgentRunOptions {
  agent: WorkspaceAgent
  userMessage: string
  conversationHistory: WorkspaceMessage[]
  agents: WorkspaceAgent[]
  onChunk?: (text: string) => void
  apiServer?: ApiServerConfig
  agentMapping?: Record<string, { agentId: string; sessionId: string }>
}

export interface AgentRunResult {
  content: string
  tasks?: Array<{ title: string; description: string; assignedTo: string }>
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  if (opts.agent.agentType === 'code') {
    return runCodeAgent(opts)
  }
  return runChatAgent(opts)
}

async function runChatAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
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

async function runCodeAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { apiServer, agentMapping, agent } = opts

  if (!apiServer?.enabled) {
    throw new Error('编程 Agent 需要 API Server 已启用。请在设置中开启 API Server。')
  }

  const mapping = agentMapping?.[agent.id]
  if (!mapping) {
    throw new Error(`编程 Agent "${agent.name}" 尚未关联 Agent 会话，请先在 Agent 页面创建对应的 Agent。`)
  }

  const { agentId, sessionId } = mapping
  const baseURL = buildBaseURL(apiServer)
  const url = `${baseURL}/v1/agents/${agentId}/sessions/${sessionId}/messages`

  const abortController = new AbortController()

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiServer.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({ content: opts.userMessage }),
    signal: abortController.signal
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `编程 Agent 请求失败: ${response.status}`)
  }

  if (!response.body) {
    throw new Error('编程 Agent 响应流为空')
  }

  let fullText = ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (!data || data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'text-delta' && parsed.text) {
              fullText += parsed.text
              opts.onChunk?.(fullText)
            } else if (parsed.type === 'text' && parsed.text) {
              fullText = parsed.text
              opts.onChunk?.(fullText)
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  const tasks = extractTasks(fullText, opts.agents)

  return { content: fullText, tasks }
}

function buildBaseURL(apiServer: ApiServerConfig): string {
  const hasProtocol = apiServer.host.startsWith('http://') || apiServer.host.startsWith('https://')
  const baseHost = hasProtocol ? apiServer.host : `http://${apiServer.host}`
  const portSegment = apiServer.port ? `:${apiServer.port}` : ''
  return `${baseHost}${portSegment}`
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
    } else if (msg.role === 'agent') {
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
