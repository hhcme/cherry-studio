import { runAgent } from '@renderer/services/workspace/agentRunner'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { addMessage, clearMessages, createTask, setAgentRunning } from '@renderer/store/workspace'
import type { MenuProps } from 'antd'
import { Dropdown } from 'antd'
import { motion } from 'framer-motion'
import { AlertTriangle, Download, Loader2, MoreVertical, Send, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'

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
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, setStreamingId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(50)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesAreaRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef(false)

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const messages = activeConversation?.messages || []
  const convAgents = agents.filter((a) => activeConversation?.agentIds.includes(a.id))

  const isRunning = Object.values(useAppSelector((s) => s.workspace.agentRunning)).some(Boolean)
  const agentRunning = useAppSelector((s) => s.workspace.agentRunning)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const executeAgentChain = useCallback(
    async (userText: string) => {
      if (!activeConversationId) return
      abortRef.current = false

      const pmAgent = convAgents.find((a) => a.isMain) || convAgents[0]
      if (!pmAgent) return

      const subAgents = convAgents.filter((a) => a.id !== pmAgent.id)

      try {
        // Step 1: PM Agent responds
        dispatch(setAgentRunning({ agentId: pmAgent.id, running: true }))
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
              createdAt: new Date().toISOString()
            }
          })
        )

        const pmResult = await runAgent({
          agent: pmAgent,
          userMessage: userText,
          conversationHistory: activeConversation?.messages || [],
          agents: convAgents,
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

        // Extract tasks from PM response
        if (pmResult.tasks && pmResult.tasks.length > 0) {
          for (const t of pmResult.tasks) {
            dispatch(createTask({ ...t, conversationId: activeConversationId }))
          }
        }

        // Step 2: Sub-agents respond serially
        for (const subAgent of subAgents) {
          if (abortRef.current) break

          dispatch(setAgentRunning({ agentId: subAgent.id, running: true }))

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
            onChunk: (text) => {
              if (abortRef.current) return
              dispatch({
                type: 'workspace/updateMessageContent',
                payload: { conversationId: activeConversationId, messageId: subMsgId, content: text }
              })
            }
          })

          dispatch(setAgentRunning({ agentId: subAgent.id, running: false }))
          setStreamingId(null)
        }
      } catch (err: any) {
        setError(err.message || '调用失败，请检查 API 配置')
        dispatch(setAgentRunning({ agentId: pmAgent.id, running: false }))
        convAgents.forEach((a) => dispatch(setAgentRunning({ agentId: a.id, running: false })))
        setStreamingId(null)
      }
    },
    [activeConversationId, convAgents, activeConversation, dispatch]
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
    setVisibleCount(50)
    void executeAgentChain(text)
  }

  if (!activeConversation) {
    return (
      <EmptyState>
        <EmptyIcon>WS</EmptyIcon>
        <EmptyTitle>多 Agent 协作工作台</EmptyTitle>
        <EmptyDesc>从左侧选择或新建一个对话开始。</EmptyDesc>
      </EmptyState>
    )
  }

  const handleExportMarkdown = () => {
    if (!activeConversation) return
    const lines = [`# ${activeConversation.name}`, '']
    for (const msg of messages) {
      const agent = agents.find((a) => a.id === msg.agentId)
      const sender = msg.role === 'user' ? '用户' : agent?.name || 'Agent'
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
        return { sender: m.role === 'user' ? '用户' : agent?.name, content: m.content, time: m.createdAt }
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

  return (
    <Container>
      <ChatHeader>
        <HeaderLeft>
          <ChatName>{activeConversation.name}</ChatName>
          {convAgents.map((a) => {
            const running = agentRunning[a.id]
            return (
              <AgentAvatarSmall
                key={a.id}
                color={AGENT_COLOR_MAP[a.color] || '#1677ff'}
                title={`${a.name}${running ? ' (思考中...)' : ''}`}
                $running={running}>
                {running ? <Loader2 size={10} className="spin" /> : a.avatar}
              </AgentAvatarSmall>
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

      <MessagesArea ref={messagesAreaRef}>
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
            {messages.slice(-visibleCount).map((msg) => {
              const agent = agents.find((a) => a.id === msg.agentId)
              if (msg.role === 'user') {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}>
                    <UserBubble>
                      <BubbleContent>{msg.content}</BubbleContent>
                      <BubbleTime>{formatTime(msg.createdAt)}</BubbleTime>
                    </UserBubble>
                  </motion.div>
                )
              }
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}>
                  <AgentBubble>
                    <AgentAvatarMedium color={AGENT_COLOR_MAP[agent?.color || 'blue'] || '#1677ff'}>
                      {agent?.avatar || '?'}
                    </AgentAvatarMedium>
                    <BubbleBody>
                      <AgentName>{agent?.name || 'Unknown'}</AgentName>
                      <AgentContent>{msg.content}</AgentContent>
                      <BubbleTime>{formatTime(msg.createdAt)}</BubbleTime>
                    </BubbleBody>
                  </AgentBubble>
                </motion.div>
              )
            })}
            <div ref={messagesEndRef} />
          </MessageList>
        )}
      </MessagesArea>

      <InputArea>
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

function formatTime(isoStr: string): string {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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
`

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
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

const ChatName = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
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
  ${({ $running }) => $running && 'animation: pulse 1.5s ease-in-out infinite;'}
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

const UserBubble = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 70%;
  margin-left: auto;
`

const BubbleContent = styled.div`
  background: var(--color-primary-background);
  color: var(--color-text);
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  font-size: 13px;
  line-height: 1.5;
`

const BubbleTime = styled.div`
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  opacity: 0.6;
`

const AgentBubble = styled.div`
  display: flex;
  gap: 10px;
  max-width: 70%;
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

const AgentName = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
`

const AgentContent = styled.div`
  background: var(--color-background-soft);
  color: var(--color-text);
  padding: 10px 14px;
  border-radius: 16px 16px 16px 4px;
  font-size: 13px;
  line-height: 1.5;
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
