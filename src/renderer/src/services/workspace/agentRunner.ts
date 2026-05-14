import { fetchChatCompletion, hasApiKey } from '@renderer/services/ApiService'
import { getDefaultAssistant, getDefaultModel, getProviderByModel } from '@renderer/services/AssistantService'
import { searchKnowledgeBase } from '@renderer/services/KnowledgeService'
import { getModelById } from '@renderer/services/ModelService'
import type { ToolCallData, WorkspaceAgent, WorkspaceMessage } from '@renderer/store/workspace'
import type { ApiServerConfig } from '@renderer/types/apiServer'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'

export interface AgentRunOptions {
  agent: WorkspaceAgent
  userMessage: string
  conversationHistory: WorkspaceMessage[]
  agents: WorkspaceAgent[]
  onChunk?: (text: string) => void
  onToolCall?: (toolData: ToolCallData) => void
  apiServer?: ApiServerConfig
  agentMapping?: Record<string, { agentId: string; sessionId: string }>
  knowledgeBaseId?: string
  workDir?: string
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

  let userMessage = opts.userMessage
  if (opts.knowledgeBaseId) {
    userMessage = await injectKnowledgeContext(opts.knowledgeBaseId, opts.userMessage)
  }

  const sdkMessages = buildMessages({ ...opts, userMessage })

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

async function injectKnowledgeContext(knowledgeBaseId: string, userMessage: string): Promise<string> {
  try {
    const { default: store } = await import('@renderer/store')
    const state = store.getState()
    const bases = state.knowledge?.bases || []
    const base = bases.find((b: any) => b.id === knowledgeBaseId)
    if (!base) return userMessage

    const results = await searchKnowledgeBase(userMessage, base)
    if (!results || results.length === 0) return userMessage

    const references = results
      .slice(0, 5)
      .map((r, i) => `[${i + 1}] ${r.pageContent}`)
      .join('\n\n')

    return `${userMessage}\n\n## 参考资料:\n${references}\n\n请基于以上参考资料回答问题，并在适当位置引用来源 [编号]。`
  } catch {
    return userMessage
  }
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
    body: JSON.stringify({ content: opts.userMessage, cwd: opts.workDir }),
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
            switch (parsed.type) {
              case 'text-delta':
                if (parsed.text) {
                  fullText += parsed.text
                  opts.onChunk?.(fullText)
                }
                break
              case 'text':
                if (parsed.text) {
                  fullText = parsed.text
                  opts.onChunk?.(fullText)
                }
                break
              case 'tool-call':
                opts.onToolCall?.({
                  toolName: parsed.toolName || 'unknown',
                  input: typeof parsed.input === 'object' && parsed.input !== null ? parsed.input : {},
                  status: 'running',
                  filePath: parsed.input?.file_path || parsed.input?.command ? undefined : undefined
                })
                break
              case 'tool-result':
                opts.onToolCall?.({
                  toolName: parsed.toolName || 'unknown',
                  input: typeof parsed.input === 'object' && parsed.input !== null ? parsed.input : {},
                  output: typeof parsed.output === 'string' ? parsed.output : JSON.stringify(parsed.output),
                  status: 'completed',
                  filePath: parsed.input?.file_path
                })
                break
              case 'tool-error':
                opts.onToolCall?.({
                  toolName: parsed.toolName || 'unknown',
                  input: typeof parsed.input === 'object' && parsed.input !== null ? parsed.input : {},
                  output: typeof parsed.error === 'string' ? parsed.error : parsed.error?.message || '工具调用出错',
                  status: 'error',
                  filePath: parsed.input?.file_path
                })
                break
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
    .map((a) => `- ${a.name}（${a.role}）[${a.agentType === 'code' ? '编程' : '对话'}]`)
    .join('\n')

  const teamNames = allAgents.filter((a) => a.id !== agent.id).map((a) => a.name)

  if (agent.isMain) {
    return `你是 PM Agent（产品经理），负责协调项目中的 Agent 团队完成用户需求。

你的职责：
1. 理解用户需求，将其分解为可执行的任务
2. 将任务分发给合适的 Agent
3. 审核产出，处理冲突

团队成员：
${teamDesc || '（暂无其他 Agent）'}

## 输出规则

先用 Markdown 写分析和计划，然后在回复的**最后**用以下格式输出任务列表（用三个反引号+json 包裹）：

\`\`\`json
{
  "tasks": [
    {
      "title": "任务标题（简洁）",
      "description": "任务详细描述，包含验收标准",
      "assignTo": "${teamNames[0] || 'Agent名称'}"
    }
  ]
}
\`\`\`

assignTo 必须是以下之一：${teamNames.join('、') || '（暂无）'}
description 应包含具体的执行步骤和验收条件。
优先级高的任务排在前面。
不要在 JSON 外面重复任务信息。`
  }

  return `你是 ${agent.name}（${agent.role}），负责根据 PM 分配的任务完成工作。

## 输出规则
- 回复使用 Markdown 格式
- 代码使用对应语言的代码块标记
- 完成任务后简要总结成果`
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
  const extracted = tryExtractTaskJSON(text)
  if (!extracted) return undefined

  try {
    const parsed = JSON.parse(extracted)
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      return parsed.tasks.map((t: any) => ({
        title: String(t.title || '未命名任务'),
        description: String(t.description || ''),
        assignedTo: resolveAgentId(String(t.assignTo || t.assign_to || t.assignee || ''), agents)
      }))
    }
  } catch {
    return undefined
  }
  return undefined
}

function tryExtractTaskJSON(text: string): string | null {
  // 1. 标准 ```json 代码块
  const jsonBlock = text.match(/```json\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlock) return jsonBlock[1].trim()

  // 2. 任意 ``` 代码块（可能没有 json 标记）
  const anyBlock = text.match(/```\s*\n?([\s\S]*?)\n?```/)
  if (anyBlock && anyBlock[1].trim().startsWith('{')) return anyBlock[1].trim()

  // 3. 行内 JSON（{...tasks...}）
  const inlineMatch = text.match(/\{[\s\S]*?"tasks"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/)
  if (inlineMatch) return inlineMatch[0]

  return null
}

function resolveAgentId(nameOrId: string, agents: WorkspaceAgent[]): string {
  const found = agents.find((a) => a.name.toLowerCase() === nameOrId.toLowerCase() || a.id === nameOrId)
  return found?.id || agents[0]?.id || ''
}
