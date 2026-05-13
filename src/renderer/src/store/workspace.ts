import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface WorkspaceAgent {
  id: string
  name: string
  role: string
  avatar: string
  color: string
  isMain: boolean
  modelId?: string
  systemPrompt?: string
}

export interface WorkspaceConversation {
  id: string
  name: string
  agentIds: string[]
  messages: WorkspaceMessage[]
  createdAt: string
  knowledgeBaseId?: string
}

export interface WorkspaceMessage {
  id: string
  agentId: string
  role: 'user' | 'agent'
  content: string
  messageType: 'text' | 'task_create' | 'task_update'
  createdAt: string
}

export type TaskStatus = 'queued' | 'in_progress' | 'blocked' | 'paused' | 'completed'

export interface WorkspaceTask {
  id: string
  title: string
  description: string
  status: TaskStatus
  conversationId: string
  assignedTo: string
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
      systemPrompt: '你是 Dev Agent（后端开发），负责根据 PM 分配的任务编写代码和技术方案。'
    },
    {
      id: 'design-1',
      name: 'Design',
      role: 'UI/UX 设计师',
      avatar: 'U',
      color: 'purple',
      isMain: false,
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
  tasks: [
    {
      id: 'task-1',
      title: '设计数据库表结构',
      description: '用户表、订单表、商品表',
      status: 'in_progress',
      conversationId: 'conv-1',
      assignedTo: 'dev-1',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-2',
      title: '绘制首页原型图',
      description: '包含导航、banner、商品列表',
      status: 'queued',
      conversationId: 'conv-1',
      assignedTo: 'design-1',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-3',
      title: '编写 API 接口文档',
      description: 'RESTful API 规范',
      status: 'completed',
      conversationId: 'conv-2',
      assignedTo: 'pm-1',
      createdAt: new Date().toISOString()
    }
  ],
  rightPanel: null,
  leftPanelCollapsed: false,
  agentRunning: {}
}

const STATUS_ORDER: TaskStatus[] = ['queued', 'in_progress', 'blocked', 'paused', 'completed']

function getNextStatus(current: TaskStatus): TaskStatus {
  const idx = STATUS_ORDER.indexOf(current)
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
}

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

    addAgent(state, action: PayloadAction<{ name: string; role: string; isMain: boolean }>) {
      const id = `${action.payload.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
      const color = AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)]
      state.agents.push({
        id,
        name: action.payload.name,
        role: action.payload.role,
        avatar: action.payload.name.charAt(0).toUpperCase(),
        color,
        isMain: action.payload.isMain
      })
    },

    removeAgent(state, action: PayloadAction<string>) {
      state.agents = state.agents.filter((a) => a.id !== action.payload)
      state.conversations.forEach((c) => {
        c.agentIds = c.agentIds.filter((id) => id !== action.payload)
      })
    },

    createTask(
      state,
      action: PayloadAction<{ title: string; description: string; assignedTo: string; conversationId: string }>
    ) {
      state.tasks.push({
        id: `task-${Date.now()}`,
        title: action.payload.title,
        description: action.payload.description,
        status: 'queued',
        conversationId: action.payload.conversationId,
        assignedTo: action.payload.assignedTo,
        createdAt: new Date().toISOString()
      })
    },

    updateTaskStatus(state, action: PayloadAction<{ taskId: string; status: TaskStatus }>) {
      const task = state.tasks.find((t) => t.id === action.payload.taskId)
      if (task) task.status = action.payload.status
    },

    cycleTaskStatus(state, action: PayloadAction<string>) {
      const task = state.tasks.find((t) => t.id === action.payload)
      if (task) task.status = getNextStatus(task.status)
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
    },

    updateMessageContent(state, action: PayloadAction<{ conversationId: string; messageId: string; content: string }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.conversationId)
      if (conv) {
        const msg = conv.messages.find((m) => m.id === action.payload.messageId)
        if (msg) msg.content = action.payload.content
      }
    },

    updateAgent(state, action: PayloadAction<{ id: string; updates: Partial<WorkspaceAgent> }>) {
      const agent = state.agents.find((a) => a.id === action.payload.id)
      if (agent) Object.assign(agent, action.payload.updates)
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
  createTask,
  updateTaskStatus,
  cycleTaskStatus,
  deleteTask,
  setRightPanel,
  toggleLeftPanel,
  setAgentRunning,
  updateMessageContent,
  updateAgent,
  setConversationKnowledgeBase,
  clearMessages
} = workspaceSlice.actions

export default workspaceSlice.reducer
