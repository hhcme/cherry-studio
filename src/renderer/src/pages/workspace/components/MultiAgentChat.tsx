import { useSettings } from '@renderer/hooks/useSettings'
import { Orchestrator } from '@renderer/services/workspace/orchestrator'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import type { TaskStatus, WorkspaceMessage } from '@renderer/store/workspace'
import {
  addMessage,
  clearMessages,
  completeRound,
  createTask,
  forceTerminate,
  setAgentAction,
  setAgentRunning,
  setRightPanel,
  startNewRound,
  updateMessageContent,
  updateTaskStatus
} from '@renderer/store/workspace'
import type { MenuProps } from 'antd'
import { Dropdown } from 'antd'
import { motion } from 'framer-motion'
import { AlertTriangle, Download, Loader2, MoreVertical, Pause, Search, Send, Trash2, X } from 'lucide-react'
import type { FC } from 'react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const { conversations, activeConversationId, agents, tasks } = useAppSelector((s) => s.workspace)
  const agentRunning = useAppSelector((s) => s.workspace.agentRunning)
  const agentAction = useAppSelector((s) => s.workspace.agentAction)
  const { apiServer } = useSettings()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(50)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const orchestratorRef = useRef<Orchestrator | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const messages = activeConversation?.messages || []
  const convAgents = agents.filter((a) => a.status === 'active' && activeConversation?.agentIds.includes(a.id))
  const roundCount = useAppSelector((s) => s.workspace.roundCount)

  const isRunning = Object.values(agentRunning).some(Boolean)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + 50, messages.length))
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [messages.length])

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages
    const q = searchQuery.toLowerCase()
    return messages.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        agents
          .find((a) => a.id === m.agentId)
          ?.name.toLowerCase()
          .includes(q)
    )
  }, [messages, searchQuery, agents])

  const executeAgentChain = useCallback(
    async (userText: string) => {
      if (!activeConversationId) return

      if (orchestratorRef.current?.running) {
        console.warn('[MultiAgentChat] Orchestrator already running, skipping')
        return
      }

      const agentMapping: Record<string, { agentId: string; sessionId: string }> = {}
      for (const a of convAgents) {
        if (a.mappedAgentId && a.mappedSessionId) {
          agentMapping[a.id] = { agentId: a.mappedAgentId, sessionId: a.mappedSessionId }
        }
      }

      const orchestrator = new Orchestrator({
        dispatch: (action) => dispatch(action),
        addMessage: (payload) => dispatch(addMessage(payload)),
        updateMessageContent: (convId, msgId, content) =>
          dispatch(updateMessageContent({ conversationId: convId, messageId: msgId, content })),
        createTask: (t) => dispatch(createTask(t)),
        updateTaskStatus: (p) => dispatch(updateTaskStatus(p)),
        setAgentRunning: (p) => dispatch(setAgentRunning(p)),
        setAgentAction: (p) => dispatch(setAgentAction(p)),
        startNewRound: () => startNewRound(),
        completeRound: () => completeRound(),
        forceTerminate: () => forceTerminate(),
        setError
      })
      orchestratorRef.current = orchestrator

      await orchestrator.runRound(userText, {
        conversationId: activeConversationId,
        agents: convAgents,
        conversationHistory: activeConversation?.messages || [],
        existingTasks: tasks,
        roundCount,
        apiServer,
        agentMapping,
        knowledgeBaseId: activeConversation?.knowledgeBaseId,
        workDir: activeConversation?.workDir
      })

      orchestratorRef.current = null
    },
    [activeConversationId, convAgents, activeConversation, dispatch, tasks, roundCount, apiServer]
  )

  const handleSend = () => {
    const text = input.trim()
    if (!text || !activeConversationId || isRunning || sendingRef.current) return

    sendingRef.current = true

    dispatch(
      addMessage({
        conversationId: activeConversationId,
        message: {
          id: `msg-${Date.now()}`,
          agentId: 'user',
          role: 'user',
          content: text,
          messageType: 'text',
          roundNumber: roundCount + 1,
          createdAt: new Date().toISOString()
        }
      })
    )

    setInput('')
    setReplyTo(null)
    setSearchQuery('')
    setVisibleCount(50)
    void executeAgentChain(text).finally(() => {
      sendingRef.current = false
    })
  }

  const handleStop = () => {
    orchestratorRef.current?.abort()
  }

  const buildMarkdown = useCallback(() => {
    if (!activeConversation) return ''
    const lines = [`# ${activeConversation.name}`, '']
    for (const msg of messages) {
      const agent = agents.find((a) => a.id === msg.agentId)
      const sender = msg.role === 'user' ? '用户' : msg.role === 'system' ? '系统' : agent?.name || 'Agent'
      lines.push(`## ${sender} (${formatTime(msg.createdAt)})`, '', msg.content, '')
    }
    return lines.join('\n')
  }, [activeConversation, messages, agents])

  const handleExportMarkdown = () => {
    if (!activeConversation) return
    const md = buildMarkdown()
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeConversation.name}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportWord = async () => {
    if (!activeConversation) return
    const md = buildMarkdown()
    try {
      await window.api.export.toWord(md, activeConversation.name)
    } catch (err: any) {
      setError(err.message || 'Word 导出失败')
    }
  }

  const handleExportJSON = () => {
    if (!activeConversation) return
    const data = {
      name: activeConversation.name,
      agents: activeConversation.agentIds.map((id) => agents.find((a) => a.id === id)?.name),
      messages: messages.map((m) => {
        const agent = agents.find((a) => a.id === m.agentId)
        return {
          sender: m.role === 'user' ? '用户' : m.role === 'system' ? '系统' : agent?.name,
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

  const handleExportTaskReport = () => {
    const convTasks = tasks.filter((t) => t.conversationId === activeConversationId)
    if (convTasks.length === 0) {
      setError('当前对话暂无任务')
      return
    }
    const lines = [
      `# 任务报告 — ${activeConversation?.name || ''}`,
      '',
      `生成时间: ${new Date().toLocaleString('zh-CN')}`,
      '',
      '## 总览',
      '',
      `- 总任务数: ${convTasks.length}`,
      `- 已完成: ${convTasks.filter((t) => t.status === 'completed').length}`,
      `- 进行中: ${convTasks.filter((t) => t.status === 'in_progress').length}`,
      `- 待处理: ${convTasks.filter((t) => t.status === 'queued').length}`,
      '',
      '## 任务列表',
      '',
      '| # | 任务 | 状态 | 优先级 | 负责人 | 依赖 |',
      '|---|------|------|--------|--------|------|'
    ]
    convTasks.forEach((t, i) => {
      const agent = agents.find((a) => a.id === t.assignedTo)
      const deps = t.dependsOn.map((d) => tasks.find((tt) => tt.id === d)?.title || d).join(', ')
      lines.push(`| ${i + 1} | ${t.title} | ${t.status} | ${t.priority} | ${agent?.name || '-'} | ${deps || '-'} |`)
    })
    lines.push('', '---', '', '## 详情', '')
    convTasks.forEach((t) => {
      const agent = agents.find((a) => a.id === t.assignedTo)
      lines.push(
        `### ${t.title}`,
        '',
        `- 状态: ${t.status}`,
        `- 优先级: ${t.priority}`,
        `- 负责人: ${agent?.name || '-'}`
      )
      if (t.description) lines.push(`- 描述: ${t.description}`)
      if (t.dependsOn?.length > 0) {
        const deps = t.dependsOn.map((d) => tasks.find((tt) => tt.id === d)?.title || d).join(', ')
        lines.push(`- 依赖: ${deps}`)
      }
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `任务报告_${activeConversation?.name || ''}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const moreMenuItems: MenuProps['items'] = [
    { key: 'export-md', label: '导出 Markdown', icon: <Download size={14} />, onClick: handleExportMarkdown },
    { key: 'export-json', label: '导出 JSON', icon: <Download size={14} />, onClick: handleExportJSON },
    { key: 'export-word', label: '导出 Word', icon: <Download size={14} />, onClick: () => void handleExportWord() },
    {
      key: 'export-tasks',
      label: '导出任务报告',
      icon: <Download size={14} />,
      onClick: handleExportTaskReport
    },
    { type: 'divider' },
    {
      key: 'clear',
      label: '清空消息',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => activeConversationId && dispatch(clearMessages(activeConversationId))
    }
  ]

  const messagesAreaRef = useRef<HTMLDivElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const mentionableAgents = useMemo(() => {
    if (!mentionQuery) return convAgents
    const q = mentionQuery.toLowerCase()
    return convAgents.filter((a) => a.name.toLowerCase().includes(q))
  }, [convAgents, mentionQuery])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)
    const selStart = e.target.selectionStart ?? val.length
    const beforeCursor = val.slice(0, selStart)
    const atMatch = beforeCursor.match(/@(\S*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      const rect = e.target.getBoundingClientRect()
      setMentionPos({ top: rect.bottom + 4, left: rect.left + selStart * 8 })
    } else {
      setMentionQuery(null)
      setMentionPos(null)
    }
  }, [])

  const handleMentionSelect = useCallback(
    (agent: { id: string; name: string }) => {
      if (!mentionQuery && mentionQuery !== '') return
      const selStart = inputRef.current?.selectionStart ?? input.length
      const beforeCursor = input.slice(0, selStart)
      const atIdx = beforeCursor.lastIndexOf('@')
      if (atIdx === -1) return
      const newInput = input.slice(0, atIdx) + `@${agent.name} ` + input.slice(selStart)
      setInput(newInput)
      setMentionQuery(null)
      setMentionPos(null)
      inputRef.current?.focus()
    },
    [input, mentionQuery]
  )

  const visibleMessages = filteredMessages.slice(-visibleCount)

  const messageGroups = useMemo(() => {
    const groups: { roundNumber: number; messages: WorkspaceMessage[] }[] = []
    for (const msg of visibleMessages) {
      const last = groups.length > 0 ? groups[groups.length - 1] : null
      if (last && last.roundNumber === msg.roundNumber) {
        last.messages.push(msg)
      } else {
        groups.push({ roundNumber: msg.roundNumber, messages: [msg] })
      }
    }
    return groups
  }, [visibleMessages])

  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('msg-highlight')
      setTimeout(() => el.classList.remove('msg-highlight'), 1500)
    }
  }, [])

  const runningAgentNames = useMemo(
    () =>
      Object.entries(agentRunning)
        .filter(([, r]) => r)
        .map(([id]) => agents.find((a) => a.id === id)?.name)
        .filter(Boolean),
    [agentRunning, agents]
  )

  if (!activeConversation) {
    return (
      <EmptyState>
        <EmptyIcon>WS</EmptyIcon>
        <EmptyTitle>多 Agent 协作工作台</EmptyTitle>
        <EmptyDesc>从左侧选择或新建一个对话开始。</EmptyDesc>
      </EmptyState>
    )
  }

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
          <HeaderBtn
            onClick={() => {
              setIsSearchOpen(!isSearchOpen)
              setSearchQuery('')
            }}>
            <Search size={14} />
          </HeaderBtn>
          <span>{messages.length} 条消息</span>
          <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
            <MoreBtn>
              <MoreVertical size={14} />
            </MoreBtn>
          </Dropdown>
        </HeaderRight>
      </ChatHeader>

      {isSearchOpen && (
        <SearchBar>
          <Search size={14} style={{ flexShrink: 0 }} />
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索消息..."
            autoFocus
          />
          {searchQuery && (
            <SearchInfo>
              {filteredMessages.length}/{messages.length}
            </SearchInfo>
          )}
          <SearchClose
            onClick={() => {
              setIsSearchOpen(false)
              setSearchQuery('')
            }}>
            <X size={14} />
          </SearchClose>
        </SearchBar>
      )}

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
            {filteredMessages.length > visibleCount && (
              <LoadMoreSentinel ref={loadMoreRef}>
                <Loader2 size={12} className="spin" /> 加载中...
              </LoadMoreSentinel>
            )}
            {searchQuery && filteredMessages.length === 0 && <NoResults>没有找到匹配的消息</NoResults>}
            {messageGroups.map((group) => (
              <React.Fragment key={`round-${group.roundNumber}-${group.messages[0]?.id}`}>
                {group.roundNumber > 0 && (
                  <RoundDivider>
                    <RoundLine />
                    <RoundLabel>Round {group.roundNumber}</RoundLabel>
                    <RoundLine />
                  </RoundDivider>
                )}
                {group.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    agents={agents}
                    allMessages={messages}
                    onReply={() => setReplyTo(msg.id)}
                    onScrollToMessage={scrollToMessage}
                    onTaskClick={() => dispatch(setRightPanel('tasks'))}
                  />
                ))}
              </React.Fragment>
            ))}
            {isRunning && runningAgentNames.length > 0 && (
              <TypingIndicator>
                <TypingDots>
                  <TypingDot $delay={0} />
                  <TypingDot $delay={0.2} />
                  <TypingDot $delay={0.4} />
                </TypingDots>
                <TypingText>{runningAgentNames.join(', ')} 正在思考...</TypingText>
              </TypingIndicator>
            )}
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
                  ? `${agent?.name || '你'}: ${(orig.content || '').slice(0, 40)}${(orig.content || '').length > 40 ? '...' : ''}`
                  : ''
              })()}
            </span>
            <ReplyClose onClick={() => setReplyTo(null)}>✕</ReplyClose>
          </ReplyBar>
        )}
        <InputWrapper>
          <StyledInput
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (mentionQuery !== null && e.key === 'Enter') {
                if (mentionableAgents.length > 0) {
                  e.preventDefault()
                  handleMentionSelect(mentionableAgents[0])
                  return
                }
                setMentionQuery(null)
                setMentionPos(null)
              }
              if (e.key === 'Escape') {
                setMentionQuery(null)
                setMentionPos(null)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={isRunning ? 'Agent 正在思考...' : '输入消息，@ 提及 Agent，Enter 发送...'}
            disabled={isRunning}
          />
          <SendBtn onClick={isRunning ? handleStop : handleSend} disabled={!isRunning && !input.trim()}>
            {isRunning ? <Pause size={16} /> : <Send size={16} />}
          </SendBtn>
        </InputWrapper>
        {mentionQuery !== null && mentionPos && mentionableAgents.length > 0 && (
          <MentionPopover style={{ top: mentionPos.top, left: mentionPos.left }}>
            {mentionableAgents.map((a) => (
              <MentionItem key={a.id} onClick={() => handleMentionSelect(a)} onMouseDown={(e) => e.preventDefault()}>
                <AgentAvatarTiny color={AGENT_COLOR_MAP[a.color] || '#1677ff'}>{a.avatar}</AgentAvatarTiny>
                <span>{a.name}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginLeft: 'auto' }}>{a.role}</span>
              </MentionItem>
            ))}
          </MentionPopover>
        )}
      </InputArea>
    </Container>
  )
}

const MessageBubble: FC<{
  msg: WorkspaceMessage
  agents: { id: string; name: string; avatar: string; color: string; agentType: string }[]
  allMessages: WorkspaceMessage[]
  onReply: () => void
  onScrollToMessage: (msgId: string) => void
  onTaskClick?: () => void
}> = ({ msg, agents, allMessages, onReply, onScrollToMessage, onTaskClick }) => {
  const agent = agents.find((a) => a.id === msg.agentId)
  const replyMsg = msg.replyTo ? allMessages.find((m) => m.id === msg.replyTo) : null
  const replyAgent = replyMsg ? agents.find((a) => a.id === replyMsg.agentId) : null

  if (msg.role === 'system') {
    if (msg.messageType === 'task_create' || msg.messageType === 'task_update') {
      const td = msg.taskData
      const taskAgent = agents.find((a) => a.id === td?.assignedTo)
      return (
        <motion.div
          id={`msg-${msg.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}>
          <TaskCardMessage onClick={onTaskClick}>
            <TaskCardIcon>
              {msg.messageType === 'task_create' ? '📋' : STATUS_EMOJI[td?.status || 'queued']}
            </TaskCardIcon>
            <TaskCardBody>
              <TaskCardTitle>{td?.title || msg.content}</TaskCardTitle>
              <TaskCardMeta>
                <StatusBadge $status={td?.status || 'queued'}>{TASK_STATUS_LABEL[td?.status || 'queued']}</StatusBadge>
                {taskAgent && <span style={{ marginLeft: 6 }}>{taskAgent.name}</span>}
              </TaskCardMeta>
            </TaskCardBody>
          </TaskCardMessage>
        </motion.div>
      )
    }
    return (
      <motion.div id={`msg-${msg.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <EventMessage>{msg.content}</EventMessage>
      </motion.div>
    )
  }

  if (msg.role === 'user') {
    return (
      <motion.div
        id={`msg-${msg.id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}>
        <UserBubble>
          {replyMsg && (
            <QuotePreviewClickable onClick={() => onScrollToMessage(replyMsg.id)}>
              回复 {replyAgent?.name || '你'}: {(replyMsg.content || '').slice(0, 60)}
              {(replyMsg.content || '').length > 60 ? '...' : ''}
            </QuotePreviewClickable>
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
      <motion.div
        id={`msg-${msg.id}`}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}>
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
    <motion.div
      id={`msg-${msg.id}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}>
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
            <QuotePreviewClickable onClick={() => onScrollToMessage(replyMsg.id)}>
              回复 {replyAgent?.name || '你'}: {(replyMsg.content || '').slice(0, 60)}
              {(replyMsg.content || '').length > 60 ? '...' : ''}
            </QuotePreviewClickable>
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

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  queued: '排队中',
  in_progress: '执行中',
  blocked: '已阻塞',
  paused: '已暂停',
  pending_review: '待审核',
  completed: '已完成'
}

const STATUS_EMOJI: Record<string, string> = {
  queued: '⏳',
  in_progress: '⚡',
  blocked: '🚫',
  paused: '⏸️',
  pending_review: '🔍',
  completed: '✅'
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

  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  .msg-highlight {
    animation: highlight-flash 1.5s ease-out;
  }

  @keyframes highlight-flash {
    0% { background: color-mix(in srgb, var(--color-primary) 20%, transparent); }
    100% { background: transparent; }
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

const HeaderBtn = styled.button`
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
    color: var(--color-text);
  }
`

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-bottom: 0.5px solid var(--color-border);
  background: var(--color-background-soft);
`

const SearchInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 12px;
  outline: none;
  &::placeholder {
    color: var(--color-text-secondary);
  }
`

const SearchInfo = styled.span`
  font-size: 10px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
`

const SearchClose = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 2px;
  &:hover {
    color: var(--color-text);
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

const LoadMoreSentinel = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
`

const NoResults = styled.div`
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
  color: var(--color-text-secondary);
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

const TaskCardMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  margin: 0 auto;
  max-width: 380px;
  cursor: pointer;
  transition: border-color 0.15s;
  &:hover {
    border-color: var(--color-primary);
  }
`

const TaskCardIcon = styled.span`
  font-size: 18px;
  flex-shrink: 0;
`

const TaskCardBody = styled.div`
  flex: 1;
  min-width: 0;
`

const TaskCardTitle = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const TaskCardMeta = styled.div`
  display: flex;
  align-items: center;
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-top: 2px;
`

const StatusBadge = styled.span<{ $status: TaskStatus }>`
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  background: ${({ $status }) => {
    switch ($status) {
      case 'completed':
        return '#52c41a20'
      case 'in_progress':
        return '#1677ff20'
      case 'blocked':
        return '#ff4d4f20'
      case 'pending_review':
        return '#faad1420'
      case 'paused':
        return '#8c8c8c20'
      default:
        return '#d9d9d920'
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'completed':
        return '#52c41a'
      case 'in_progress':
        return '#1677ff'
      case 'blocked':
        return '#ff4d4f'
      case 'pending_review':
        return '#faad14'
      case 'paused':
        return '#8c8c8c'
      default:
        return '#8c8c8c'
    }
  }};
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

const QuotePreviewClickable = styled.div`
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
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }
`

const RoundDivider = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
`

const RoundLine = styled.div`
  flex: 1;
  height: 0.5px;
  background: var(--color-border);
`

const RoundLabel = styled.span`
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;
  padding: 2px 8px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  border-radius: 10px;
`

const TypingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
`

const TypingDots = styled.div`
  display: flex;
  gap: 3px;
`

const TypingDot = styled.div<{ $delay: number }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  opacity: 0.6;
  animation: typing-bounce 1.2s ease-in-out infinite;
  animation-delay: ${({ $delay }) => $delay}s;
`

const TypingText = styled.span`
  font-size: 11px;
  color: var(--color-text-secondary);
`

const MentionPopover = styled.div`
  position: absolute;
  z-index: 100;
  min-width: 200px;
  max-height: 180px;
  overflow-y: auto;
  background: var(--color-background);
  border: 0.5px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
`

const MentionItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
  }
`

const AgentAvatarTiny = styled.div<{ color: string }>`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  color: ${({ color }) => color};
  background: ${({ color }) => color}18;
  flex-shrink: 0;
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
  position: relative;
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
