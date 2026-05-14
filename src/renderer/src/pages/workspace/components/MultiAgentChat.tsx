import { useSettings } from '@renderer/hooks/useSettings'
import { runAgent } from '@renderer/services/workspace/agentRunner'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import type { WorkspaceMessage } from '@renderer/store/workspace'
import { addMessage, clearMessages, createTask, setAgentAction, setAgentRunning } from '@renderer/store/workspace'
import type { MenuProps } from 'antd'
import { Dropdown } from 'antd'
import { motion } from 'framer-motion'
import { AlertTriangle, Download, Loader2, MoreVertical, Send, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'

import ToolOutputBubble from './ToolOutputBubble'
import WorkspaceMarkdown from './WorkspaceMarkdown'

const AGENT_COLOR_MAP: Record<string, string> = {
  blue: '#1677ff',
  purple: '#722ed1',
  emerald: '#52c41a',
  orange: '#fa8c16',
  pink: '#eb2f96',
  cyan: '#13c2c2',
  amber: '#fadb14',
  rose: '#f5222d'
}

const MultiAgentChat: FC = () => {
  const dispatch = useAppDispatch()
  const { conversations, activeConversationId, agents } = useAppSelector((s) => s.workspace)
  const agentRunning = useAppSelector((s) => s.workspace.agentRunning)
  const agentAction = useAppSelector((s) => s.workspace.agentAction)
  const { apiServer } = useSettings()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, setStreamingId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(50)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef(false)

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const messages = activeConversation?.messages || []
  const convAgents = agents.filter((a) => a.status === 'active' && activeConversation?.agentIds.includes(a.id))

  const isRunning = Object.values(agentRunning).some(Boolean)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const addEventMessage = useCallback(
    (text: string) => {
      if (!activeConversationId) return
      dispatch(
        addMessage({
          conversationId: activeConversationId,
          message: {
            id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            agentId: 'system',
            role: 'event',
            content: text,
            messageType: 'text',
            createdAt: new Date().toISOString()
          }
        })
      )
    },
    [activeConversationId, dispatch]
  )

  const executeAgentChain = useCallback(
    async (userText: string) => {
      if (!activeConversationId) return
      abortRef.current = false

      const pmAgent = convAgents.find((a) => a.isMain) || convAgents[0]
      if (!pmAgent) return

      const subAgents = convAgents.filter((a) => a.id !== pmAgent.id && a.agentType === 'chat')

      try {
        dispatch(setAgentRunning({ agentId: pmAgent.id, running: true }))
        dispatch(setAgentAction({ agentId: pmAgent.id, action: '正在分析需求...' }))
        setError(null)

        const pmMsgId = `msg-${Date.now()}-pm`
        setStreamingId(pmMsgId)
        dispatch(
          addMessage({
            conversationId: activeConversationId,
            message: {
              id: pmMsgId,
              agentId: pmAgent.id,
              role: 'agent',
              content: '',
              messageType: 'text',
              createdAt: new Date().toISOString(),
              replyTo: replyTo || undefined
            }
          })
        )

        const pmResult = await runAgent({
          agent: pmAgent,
          userMessage: userText,
          conversationHistory: activeConversation?.messages || [],
          agents: convAgents,
          apiServer,
          onChunk: (text) => {
            if (abortRef.current) return
            dispatch({
              type: 'workspace/updateMessageContent',
              payload: { conversationId: activeConversationId, messageId: pmMsgId, content: text }
            })
          }
        })

        dispatch(setAgentRunning({ agentId: pmAgent.id, running: false }))
        setStreamingId(null)

        if (pmResult.tasks && pmResult.tasks.length > 0) {
          for (const t of pmResult.tasks) {
            dispatch(createTask({ ...t, conversationId: activeConversationId }))
          }
          addEventMessage(`PM 创建了 ${pmResult.tasks.length} 个任务`)
        }

        for (const subAgent of subAgents) {
          if (abortRef.current) break

          dispatch(setAgentRunning({ agentId: subAgent.id, running: true }))
          dispatch(setAgentAction({ agentId: subAgent.id, action: '正在执行任务...' }))
          addEventMessage(`${subAgent.name} 开始工作`)

          const subMsgId = `msg-${Date.now()}-${subAgent.id}`
          setStreamingId(subMsgId)
          dispatch(
            addMessage({
              conversationId: activeConversationId,
              message: {
                id: subMsgId,
                agentId: subAgent.id,
                role: 'agent',
                content: '',
                messageType: 'text',
                createdAt: new Date().toISOString()
              }
            })
          )

          await runAgent({
            agent: subAgent,
            userMessage: `PM（${pmAgent.name}）分配了以下任务，请执行：\n${userText}`,
            conversationHistory: [
              ...(activeConversation?.messages || []),
              {
                id: 'ctx-pm',
                agentId: pmAgent.id,
                role: 'agent',
                content: pmResult.content,
                messageType: 'text',
                createdAt: new Date().toISOString()
              }
            ],
            agents: convAgents,
            apiServer,
            onChunk: (text) => {
              if (abortRef.current) return
              dispatch({
                type: 'workspace/updateMessageContent',
                payload: {
                  conversationId: activeConversationId,
                  messageId: subMsgId,
                  content: text
                }
              })
            }
          })

          dispatch(setAgentRunning({ agentId: subAgent.id, running: false }))
          setStreamingId(null)
          addEventMessage(`${subAgent.name} 完成了任务`)
        }
      } catch (err: any) {
        setError(err.message || '调用失败，请检查 API 配置')
        convAgents.forEach((a) => dispatch(setAgentRunning({ agentId: a.id, running: false })))
        setStreamingId(null)
      }
    },
    [activeConversationId, convAgents, activeConversation, dispatch, replyTo, addEventMessage, apiServer]
  )

  const handleSend = () => {
    const text = input.trim()
    if (!text || !activeConversationId || isRunning) return

    dispatch(
      addMessage({
        conversationId: activeConversationId,
        message: {
          id: `msg-${Date.now()}`,
          agentId: 'user',
          role: 'user',
          content: text,
          messageType: 'text',
          createdAt: new Date().toISOString()
        }
      })
    )

    setInput('')
    setReplyTo(null)
    setVisibleCount(50)
    void executeAgentChain(text)
  }

  const handleExportMarkdown = () => {
    if (!activeConversation) return
    const lines = [`# ${activeConversation.name}`, '']
    for (const msg of messages) {
      const agent = agents.find((a) => a.id === msg.agentId)
      const sender = msg.role === 'user' ? '用户' : msg.role === 'event' ? '系统' : agent?.name || 'Agent'
      lines.push(`## ${sender} (${formatTime(msg.createdAt)})`, '', msg.content, '')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeConversation.name}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = () => {
    if (!activeConversation) return
    const data = {
      name: activeConversation.name,
      agents: activeConversation.agentIds.map((id) => agents.find((a) => a.id === id)?.name),
      messages: messages.map((m) => {
        const agent = agents.find((a) => a.id === m.agentId)
        return {
          sender: m.role === 'user' ? '用户' : m.role === 'event' ? '系统' : agent?.name,
          content: m.content,
          time: m.createdAt
        }
      })
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeConversation.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const moreMenuItems: MenuProps['items'] = [
    { key: 'export-md', label: '导出 Markdown', icon: <Download size={14} />, onClick: handleExportMarkdown },
    { key: 'export-json', label: '导出 JSON', icon: <Download size={14} />, onClick: handleExportJSON },
    { type: 'divider' },
    {
      key: 'clear',
      label: '清空消息',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => activeConversationId && dispatch(clearMessages(activeConversationId))
    }
  ]

  if (!activeConversation) {
    return (
      <EmptyState>
        <EmptyIcon>WS</EmptyIcon>
        <EmptyTitle>多 Agent 协作工作台</EmptyTitle>
        <EmptyDesc>从左侧选择或新建一个对话开始。</EmptyDesc>
      </EmptyState>
    )
  }

  const visibleMessages = messages.slice(-visibleCount)

  return (
    <Container>
      <ChatHeader>
        <HeaderLeft>
          <ChatName>{activeConversation.name}</ChatName>
          {convAgents.map((a) => {
            const running = agentRunning[a.id]
            const action = agentAction[a.id]
            return (
              <AgentStatusWrap key={a.id} title={`${a.name}${running ? ` (${action})` : ''}`}>
                <AgentAvatarSmall color={AGENT_COLOR_MAP[a.color] || '#1677ff'} $running={running}>
                  {running ? <Loader2 size={10} className="spin" /> : a.avatar}
                </AgentAvatarSmall>
                {running && action && <AgentActionLabel>{action}</AgentActionLabel>}
              </AgentStatusWrap>
            )
          })}
        </HeaderLeft>
        <HeaderRight>
          <span>{messages.length} 条消息</span>
          <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
            <MoreBtn>
              <MoreVertical size={14} />
            </MoreBtn>
          </Dropdown>
        </HeaderRight>
      </ChatHeader>

      {error && (
        <ErrorBar>
          <AlertTriangle size={14} />
          <span>{error}</span>
          <ErrorClose onClick={() => setError(null)}>✕</ErrorClose>
        </ErrorBar>
      )}

      <MessagesArea>
        {messages.length === 0 ? (
          <EmptyState>
            <EmptyIcon>WS</EmptyIcon>
            <EmptyTitle>多 Agent 协作工作台</EmptyTitle>
            <EmptyDesc>输入你的需求，PM Agent 将协调团队完成。</EmptyDesc>
          </EmptyState>
        ) : (
          <MessageList>
            {messages.length > visibleCount && (
              <LoadMoreBtn onClick={() => setVisibleCount((c) => c + 50)}>
                ↑ 加载更早消息（还有 {messages.length - visibleCount} 条）
              </LoadMoreBtn>
            )}
            {visibleMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                agents={agents}
                allMessages={messages}
                onReply={() => setReplyTo(msg.id)}
              />
            ))}
            <div ref={messagesEndRef} />
          </MessageList>
        )}
      </MessagesArea>

      <InputArea>
        {replyTo && (
          <ReplyBar>
            <span>
              回复: {(() => {
                const orig = messages.find((m) => m.id === replyTo)
                const agent = agents.find((a) => a.id === orig?.agentId)
                return orig
                  ? `${agent?.name || '你'}: ${orig.content.slice(0, 40)}${orig.content.length > 40 ? '...' : ''}`
                  : ''
              })()}
            </span>
            <ReplyClose onClick={() => setReplyTo(null)}>✕</ReplyClose>
          </ReplyBar>
        )}
        <InputWrapper>
          <StyledInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={isRunning ? 'Agent 正在思考...' : '输入消息，Enter 发送...'}
            disabled={isRunning}
          />
          <SendBtn onClick={handleSend} disabled={!input.trim() || isRunning}>
            {isRunning ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
          </SendBtn>
        </InputWrapper>
      </InputArea>
    </Container>
  )
}

const MessageBubble: FC<{
  msg: WorkspaceMessage
  agents: { id: string; name: string; avatar: string; color: string; agentType: string }[]
  allMessages: WorkspaceMessage[]
  onReply: () => void
}> = ({ msg, agents, allMessages, onReply }) => {
  const agent = agents.find((a) => a.id === msg.agentId)
  const replyMsg = msg.replyTo ? allMessages.find((m) => m.id === msg.replyTo) : null
  const replyAgent = replyMsg ? agents.find((a) => a.id === replyMsg.agentId) : null

  if (msg.role === 'event') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <EventMessage>{msg.content}</EventMessage>
      </motion.div>
    )
  }

  if (msg.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <UserBubble>
          {replyMsg && (
            <QuotePreview>
              回复 {replyAgent?.name || '你'}: {replyMsg.content.slice(0, 60)}
              {replyMsg.content.length > 60 ? '...' : ''}
            </QuotePreview>
          )}
          <BubbleContent>{msg.content}</BubbleContent>
          <BubbleFooter>
            <BubbleTime>{formatTime(msg.createdAt)}</BubbleTime>
            <ReplyBtn onClick={onReply}>回复</ReplyBtn>
          </BubbleFooter>
        </UserBubble>
      </motion.div>
    )
  }

  if (msg.messageType === 'tool_call' || msg.messageType === 'tool_result') {
    return (
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
        <AgentBubble>
          <AgentAvatarMedium color={AGENT_COLOR_MAP[agent?.color || 'blue'] || '#1677ff'}>
            {agent?.avatar || '?'}
          </AgentAvatarMedium>
          <BubbleBody>
            <AgentNameRow>
              <AgentName>{agent?.name || 'Unknown'}</AgentName>
              {agent?.agentType === 'code' && <CodeTag>Code</CodeTag>}
              <ToolLabel>{msg.messageType === 'tool_call' ? '工具调用' : '工具结果'}</ToolLabel>
            </AgentNameRow>
            <ToolOutputBubble msg={msg} />
          </BubbleBody>
        </AgentBubble>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
      <AgentBubble>
        <AgentAvatarMedium color={AGENT_COLOR_MAP[agent?.color || 'blue'] || '#1677ff'}>
          {agent?.avatar || '?'}
        </AgentAvatarMedium>
        <BubbleBody>
          <AgentNameRow>
            <AgentName>{agent?.name || 'Unknown'}</AgentName>
            {agent?.agentType === 'code' && <CodeTag>Code</CodeTag>}
          </AgentNameRow>
          {replyMsg && (
            <QuotePreview>
              回复 {replyAgent?.name || '你'}: {replyMsg.content.slice(0, 60)}
              {replyMsg.content.length > 60 ? '...' : ''}
            </QuotePreview>
          )}
          <AgentContent>
            <WorkspaceMarkdown content={msg.content} />
          </AgentContent>
          <BubbleFooter>
            <BubbleTime>{formatTime(msg.createdAt)}</BubbleTime>
            <ReplyBtn onClick={onReply}>回复</ReplyBtn>
          </BubbleFooter>
        </BubbleBody>
      </AgentBubble>
    </motion.div>
  )
}

function formatTime(isoStr: string): string {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .spin {
    animation: spin 1s linear infinite;
  }
`

const ChatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
  border-bottom: 0.5px solid var(--color-border);
  flex-shrink: 0;
`

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
`

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
`

const ChatName = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const AgentStatusWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`

const AgentAvatarSmall = styled.div<{ color: string; $running?: boolean }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: ${({ color }) => color};
  background: ${({ color }) => color}18;
  flex-shrink: 0;
  ${({ $running }) => $running && 'animation: pulse 1.5s ease-in-out infinite;'}

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`

const AgentActionLabel = styled.span`
  font-size: 10px;
  color: var(--color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
`

const MoreBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
  }
`

const ErrorBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  color: var(--color-error);
  font-size: 12px;
  border-bottom: 0.5px solid color-mix(in srgb, var(--color-error) 20%, transparent);
`

const ErrorClose = styled.button`
  margin-left: auto;
  background: none;
  border: none;
  color: var(--color-error);
  cursor: pointer;
  font-size: 12px;
`

const MessagesArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
`

const LoadMoreBtn = styled.button`
  display: block;
  margin: 0 auto 12px;
  padding: 6px 16px;
  border: 0.5px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-background-soft);
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }
`

const MessageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const EventMessage = styled.div`
  text-align: center;
  font-size: 11px;
  color: var(--color-text-secondary);
  padding: 4px 16px;
  background: var(--color-background-soft);
  border-radius: 12px;
  margin: 0 auto;
  max-width: 300px;
`

const UserBubble = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 70%;
  margin-left: auto;
`

const AgentBubble = styled.div`
  display: flex;
  gap: 10px;
  max-width: 80%;
`

const AgentAvatarMedium = styled.div<{ color: string }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: ${({ color }) => color};
  background: ${({ color }) => color}18;
  flex-shrink: 0;
`

const BubbleBody = styled.div`
  flex: 1;
  min-width: 0;
`

const AgentNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
`

const AgentName = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
`

const CodeTag = styled.span`
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-weight: 500;
`

const ToolLabel = styled.span`
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, #faad14 12%, transparent);
  color: #faad14;
  font-weight: 500;
`

const QuotePreview = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  padding: 4px 8px;
  margin-bottom: 4px;
  border-left: 2px solid var(--color-primary);
  background: var(--color-background-soft);
  border-radius: 0 4px 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const BubbleContent = styled.div`
  background: var(--color-primary-background);
  color: var(--color-text);
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
`

const AgentContent = styled.div`
  background: var(--color-background-soft);
  color: var(--color-text);
  padding: 10px 14px;
  border-radius: 16px 16px 16px 4px;
`

const BubbleFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  justify-content: flex-end;
`

const BubbleTime = styled.div`
  font-size: 10px;
  color: var(--color-text-secondary);
  opacity: 0.6;
`

const ReplyBtn = styled.button`
  font-size: 10px;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transition: opacity 0.2s;
  &:hover {
    color: var(--color-primary);
  }
  ${AgentBubble}:hover &, ${UserBubble}:hover & {
    opacity: 1;
  }
`

const ReplyBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  margin-bottom: 4px;
  background: var(--color-background-soft);
  border-radius: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const ReplyClose = styled.button`
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
`

const InputArea = styled.div`
  padding: 12px 16px;
  border-top: 0.5px solid var(--color-border);
  flex-shrink: 0;
`

const InputWrapper = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`

const StyledInput = styled.input`
  flex: 1;
  padding: 10px 14px;
  border-radius: 12px;
  border: 0.5px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 13px;
  outline: none;
  &:focus {
    border-color: var(--color-primary);
  }
  &::placeholder {
    color: var(--color-text-secondary);
  }
`

const SendBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 10px;
  background: var(--color-primary);
  color: var(--color-background);
  cursor: pointer;
  flex-shrink: 0;
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &:hover:not(:disabled) {
    opacity: 0.9;
  }
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
`

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-soft);
  color: var(--color-text-secondary);
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
`

const EmptyTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8px;
`

const EmptyDesc = styled.div`
  font-size: 13px;
  color: var(--color-text-secondary);
  max-width: 300px;
`

export default MultiAgentChat
