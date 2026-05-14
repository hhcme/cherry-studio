import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type AgentType = 'chat' | 'code'
export type AgentStatus = 'active' | 'paused'
export type TaskPriority = 'normal' | 'high' | 'urgent'
export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'

export interface WorkspaceAgent {
  id: string
  name: string
  role: string
  avatar: string
  color: string
  isMain: boolean
  modelId?: string
  systemPrompt?: string
  agentType: AgentType
  status: AgentStatus
  permissionMode: PermissionMode
  workDir?: string
}

export interface WorkspaceConversation {
  id: string
  name: string
  agentIds: string[]
  messages: WorkspaceMessage[]
  createdAt: string
  knowledgeBaseId?: string
  workDir?: string
}

export interface ToolCallData {
  toolName: string
  input: Record<string, any>
  output?: string
  status: 'running' | 'completed' | 'error'
  filePath?: string
}

export interface WorkspaceMessage {
  id: string
  agentId: string
  role: 'user' | 'agent' | 'event'
  content: string
  messageType: 'text' | 'task_create' | 'task_update' | 'tool_call' | 'tool_result'
  createdAt: string
  replyTo?: string
  toolData?: ToolCallData
}

export type TaskStatus = 'queued' | 'in_progress' | 'blocked' | 'paused' | 'pending_review' | 'completed'

export interface WorkspaceTask {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  conversationId: string
  assignedTo: string
  dependsOn: string[]
  createdAt: string
}

export interface WorkspaceState {
  agents: WorkspaceAgent[]
  conversations: WorkspaceConversation[]
  activeConversationId: string | null
  tasks: WorkspaceTask[]
  rightPanel: string | null
  leftPanelCollapsed: boolean
  agentRunning: Record<string, boolean>
  agentAction: Record<string, string>
  activeFile: string | null
}

const AGENT_COLORS = ['blue', 'purple', 'emerald', 'orange', 'pink', 'cyan', 'amber', 'rose']

const initialState: WorkspaceState = {
  agents: [
    {
      id: 'pm-1',
      name: 'PM',
      role: '产品经理 / 主 Agent',
      avatar: 'P',
      color: 'blue',
      isMain: true,
      agentType: 'chat',
      status: 'active',
      permissionMode: 'default',
      systemPrompt:
        '你是 PM Agent（产品经理），负责协调项目中的 Agent 团队完成用户需求。你的职责：1. 理解用户需求，将其分解为可执行的任务 2. 将任务分发给合适的 Agent 3. 审核产出，处理冲突。回复格式：使用 Markdown。'
    },
    {
      id: 'dev-1',
      name: 'Dev',
      role: '后端开发工程师',
      avatar: 'D',
      color: 'emerald',
      isMain: false,
      agentType: 'code',
      status: 'active',
      permissionMode: 'default',
      systemPrompt: '你是 Dev Agent（后端开发），负责根据 PM 分配的任务编写代码和技术方案。'
    },
    {
      id: 'design-1',
      name: 'Design',
      role: 'UI/UX 设计师',
      avatar: 'U',
      color: 'purple',
      isMain: false,
      agentType: 'chat',
      status: 'active',
      permissionMode: 'default',
      systemPrompt: '你是 Design Agent（设计师），负责 UI 设计和用户体验方案。'
    }
  ],
  conversations: [
    {
      id: 'conv-1',
      name: '需求分析讨论',
      agentIds: ['pm-1', 'dev-1'],
      messages: [],
      createdAt: new Date().toISOString()
    },
    {
      id: 'conv-2',
      name: '技术方案评审',
      agentIds: ['pm-1', 'dev-1', 'design-1'],
      messages: [],
      createdAt: new Date().toISOString()
    }
  ],
  activeConversationId: 'conv-1',
  tasks: [],
  rightPanel: null,
  leftPanelCollapsed: false,
  agentRunning: {},
  agentAction: {},
  activeFile: null
}

const STATUS_ORDER: TaskStatus[] = ['queued', 'in_progress', 'blocked', 'paused', 'pending_review', 'completed']

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    createConversation(state, action: PayloadAction<{ name: string; agentIds: string[] }>) {
      const id = `conv-${Date.now()}`
      state.conversations.push({
        id,
        name: action.payload.name,
        agentIds: action.payload.agentIds,
        messages: [],
        createdAt: new Date().toISOString()
      })
      state.activeConversationId = id
    },

    deleteConversation(state, action: PayloadAction<string>) {
      state.conversations = state.conversations.filter((c) => c.id !== action.payload)
      state.tasks = state.tasks.filter((t) => t.conversationId !== action.payload)
      if (state.activeConversationId === action.payload) {
        state.activeConversationId = state.conversations[0]?.id || null
      }
    },

    renameConversation(state, action: PayloadAction<{ id: string; name: string }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.id)
      if (conv) conv.name = action.payload.name
    },

    setActiveConversation(state, action: PayloadAction<string | null>) {
      state.activeConversationId = action.payload
    },

    addMessage(state, action: PayloadAction<{ conversationId: string; message: WorkspaceMessage }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.conversationId)
      if (conv) conv.messages.push(action.payload.message)
    },

    addAgent(
      state,
      action: PayloadAction<{
        name: string
        role: string
        isMain: boolean
        agentType: AgentType
        systemPrompt?: string
        modelId?: string
      }>
    ) {
      const id = `${action.payload.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
      const color = AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)]
      state.agents.push({
        id,
        name: action.payload.name,
        role: action.payload.role,
        avatar: action.payload.name.charAt(0).toUpperCase(),
        color,
        isMain: action.payload.isMain,
        agentType: action.payload.agentType,
        status: 'active',
        permissionMode: 'default',
        systemPrompt: action.payload.systemPrompt,
        modelId: action.payload.modelId
      })
    },

    removeAgent(state, action: PayloadAction<string>) {
      state.agents = state.agents.filter((a) => a.id !== action.payload)
      state.conversations.forEach((c) => {
        c.agentIds = c.agentIds.filter((id) => id !== action.payload)
      })
    },

    cloneAgent(state, action: PayloadAction<string>) {
      const src = state.agents.find((a) => a.id === action.payload)
      if (!src) return
      const id = `${src.name.toLowerCase().replace(/\s+/g, '-')}-clone-${Date.now()}`
      state.agents.push({
        ...src,
        id,
        name: `${src.name} (副本)`,
        isMain: false
      })
    },

    updateAgent(state, action: PayloadAction<{ id: string; updates: Partial<WorkspaceAgent> }>) {
      const agent = state.agents.find((a) => a.id === action.payload.id)
      if (agent) Object.assign(agent, action.payload.updates)
    },

    pauseAgent(state, action: PayloadAction<string>) {
      const agent = state.agents.find((a) => a.id === action.payload)
      if (agent) agent.status = 'paused'
    },

    resumeAgent(state, action: PayloadAction<string>) {
      const agent = state.agents.find((a) => a.id === action.payload)
      if (agent) agent.status = 'active'
    },

    addAgentToConversation(state, action: PayloadAction<{ conversationId: string; agentId: string }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.conversationId)
      if (conv && !conv.agentIds.includes(action.payload.agentId)) {
        conv.agentIds.push(action.payload.agentId)
      }
    },

    removeAgentFromConversation(state, action: PayloadAction<{ conversationId: string; agentId: string }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.conversationId)
      if (conv) {
        conv.agentIds = conv.agentIds.filter((id) => id !== action.payload.agentId)
      }
    },

    createTask(
      state,
      action: PayloadAction<{
        title: string
        description: string
        assignedTo: string
        conversationId: string
        priority?: TaskPriority
        dependsOn?: string[]
      }>
    ) {
      state.tasks.push({
        id: `task-${Date.now()}`,
        title: action.payload.title,
        description: action.payload.description,
        status: 'queued',
        priority: action.payload.priority || 'normal',
        conversationId: action.payload.conversationId,
        assignedTo: action.payload.assignedTo,
        dependsOn: action.payload.dependsOn || [],
        createdAt: new Date().toISOString()
      })
    },

    updateTaskStatus(state, action: PayloadAction<{ taskId: string; status: TaskStatus }>) {
      const task = state.tasks.find((t) => t.id === action.payload.taskId)
      if (task) task.status = action.payload.status
    },

    updateTaskPriority(state, action: PayloadAction<{ taskId: string; priority: TaskPriority }>) {
      const task = state.tasks.find((t) => t.id === action.payload.taskId)
      if (task) task.priority = action.payload.priority
    },

    cycleTaskStatus(state, action: PayloadAction<string>) {
      const task = state.tasks.find((t) => t.id === action.payload)
      if (task) task.status = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]
    },

    deleteTask(state, action: PayloadAction<string>) {
      state.tasks = state.tasks.filter((t) => t.id !== action.payload)
    },

    setRightPanel(state, action: PayloadAction<string | null>) {
      state.rightPanel = action.payload
    },

    toggleLeftPanel(state) {
      state.leftPanelCollapsed = !state.leftPanelCollapsed
    },

    setAgentRunning(state, action: PayloadAction<{ agentId: string; running: boolean }>) {
      state.agentRunning[action.payload.agentId] = action.payload.running
      if (!action.payload.running) {
        delete state.agentAction[action.payload.agentId]
      }
    },

    setAgentAction(state, action: PayloadAction<{ agentId: string; action: string }>) {
      state.agentAction[action.payload.agentId] = action.payload.action
    },

    updateMessageContent(state, action: PayloadAction<{ conversationId: string; messageId: string; content: string }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.conversationId)
      if (conv) {
        const msg = conv.messages.find((m) => m.id === action.payload.messageId)
        if (msg) msg.content = action.payload.content
      }
    },

    setConversationKnowledgeBase(
      state,
      action: PayloadAction<{ conversationId: string; knowledgeBaseId: string | null }>
    ) {
      const conv = state.conversations.find((c) => c.id === action.payload.conversationId)
      if (conv) {
        conv.knowledgeBaseId = action.payload.knowledgeBaseId || undefined
      }
    },

    clearMessages(state, action: PayloadAction<string>) {
      const conv = state.conversations.find((c) => c.id === action.payload)
      if (conv) conv.messages = []
    },

    setConversationWorkDir(state, action: PayloadAction<{ conversationId: string; workDir: string }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.conversationId)
      if (conv) conv.workDir = action.payload.workDir
    },

    setActiveFile(state, action: PayloadAction<string | null>) {
      state.activeFile = action.payload
    }
  }
})

export const {
  createConversation,
  deleteConversation,
  renameConversation,
  setActiveConversation,
  addMessage,
  addAgent,
  removeAgent,
  cloneAgent,
  updateAgent,
  pauseAgent,
  resumeAgent,
  addAgentToConversation,
  removeAgentFromConversation,
  createTask,
  updateTaskStatus,
  updateTaskPriority,
  cycleTaskStatus,
  deleteTask,
  setRightPanel,
  toggleLeftPanel,
  setAgentRunning,
  setAgentAction,
  updateMessageContent,
  setConversationKnowledgeBase,
  clearMessages,
  setConversationWorkDir,
  setActiveFile
} = workspaceSlice.actions

export default workspaceSlice.reducer
