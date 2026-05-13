import { CheckOutlined, DatabaseOutlined, DeleteOutlined, UndoOutlined } from '@ant-design/icons'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  cycleTaskStatus,
  deleteTask,
  setConversationKnowledgeBase,
  setRightPanel,
  updateTaskStatus
} from '@renderer/store/workspace'
import { Select, Tooltip } from 'antd'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, Circle, Clock, FileText, Globe, ListChecks, Pause, Users, X } from 'lucide-react'
import type { FC } from 'react'
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

const panels = [
  { id: 'tasks', icon: ListChecks, label: '任务' },
  { id: 'agents', icon: Users, label: 'Agent' },
  { id: 'knowledge', icon: DatabaseOutlined, label: '知识库' },
  { id: 'browser', icon: Globe, label: '浏览器' },
  { id: 'editor', icon: FileText, label: '文档' },
  { id: 'automation', icon: Clock, label: '自动化' }
]

const columns = [
  { key: 'in_progress', label: '进行中', color: '#1677ff' },
  { key: 'queued', label: '队列中', color: 'var(--color-text-secondary)' },
  { key: 'blocked', label: '阻塞/等待', color: '#faad14' },
  { key: 'paused', label: '已暂停', color: 'var(--color-text-secondary)' },
  { key: 'completed', label: '已完成', color: '#52c41a' }
]

const ToolPanel: FC = () => {
  const dispatch = useAppDispatch()
  const { rightPanel } = useAppSelector((s) => s.workspace)

  return (
    <Container>
      <SlidePanel $open={!!rightPanel}>
        <AnimatePresence>
          {rightPanel && (
            <motion.div
              key={rightPanel}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              style={{ height: '100%' }}>
              <PanelContent>
                <PanelHeader>
                  <PanelTitle>{panels.find((p) => p.id === rightPanel)?.label || '工具'}</PanelTitle>
                  <CloseBtn onClick={() => dispatch(setRightPanel(null))}>
                    <X size={14} />
                  </CloseBtn>
                </PanelHeader>
                <PanelBody>
                  {rightPanel === 'tasks' && <TaskBoard />}
                  {rightPanel === 'agents' && <AgentTeamPanel />}
                  {rightPanel === 'knowledge' && <KnowledgePanel />}
                  {!['tasks', 'agents', 'knowledge'].includes(rightPanel) && (
                    <Placeholder>
                      <p>{panels.find((p) => p.id === rightPanel)?.label}</p>
                      <span>（待实现）</span>
                    </Placeholder>
                  )}
                </PanelBody>
              </PanelContent>
            </motion.div>
          )}
        </AnimatePresence>
      </SlidePanel>

      <IconBar>
        {panels.map(({ id, icon: Icon, label }) => (
          <Tooltip key={id} title={label} placement="left">
            <IconBtn $active={rightPanel === id} onClick={() => dispatch(setRightPanel(rightPanel === id ? null : id))}>
              <Icon style={{ fontSize: 16, width: 16, height: 16 }} />
            </IconBtn>
          </Tooltip>
        ))}
      </IconBar>
    </Container>
  )
}

const TaskBoard: FC = () => {
  const dispatch = useAppDispatch()
  const { tasks, agents, activeConversationId } = useAppSelector((s) => s.workspace)
  const convTasks = activeConversationId ? tasks.filter((t) => t.conversationId === activeConversationId) : []

  return (
    <div>
      <BoardHeader>
        <span>任务板 ({convTasks.filter((t) => t.status !== 'completed').length})</span>
      </BoardHeader>
      {columns.map((col) => {
        const colTasks = convTasks.filter((t) => t.status === col.key)
        return (
          <ColumnSection key={col.key}>
            <ColumnLabel style={{ color: col.color }}>
              {col.label} ({colTasks.length})
            </ColumnLabel>
            {colTasks.map((task) => {
              const agent = agents.find((a) => a.id === task.assignedTo)
              return (
                <TaskCard key={task.id}>
                  <TaskHeader>
                    <StatusIcon onClick={() => dispatch(cycleTaskStatus(task.id))} title="点击切换状态">
                      {task.status === 'completed' ? (
                        <CheckCircle size={14} color="#52c41a" />
                      ) : task.status === 'in_progress' ? (
                        <Clock size={14} color="#1677ff" />
                      ) : task.status === 'blocked' ? (
                        <Pause size={14} color="#faad14" />
                      ) : (
                        <Circle size={14} />
                      )}
                    </StatusIcon>
                    <TaskTitle $done={task.status === 'completed'}>{task.title}</TaskTitle>
                    <TaskActions>
                      {task.status === 'completed' ? (
                        <ActionBtn
                          onClick={() => dispatch(updateTaskStatus({ taskId: task.id, status: 'queued' }))}
                          title="重新打开">
                          <UndoOutlined style={{ fontSize: 12 }} />
                        </ActionBtn>
                      ) : (
                        <ActionBtn
                          onClick={() => dispatch(updateTaskStatus({ taskId: task.id, status: 'completed' }))}
                          title="完成">
                          <CheckOutlined style={{ fontSize: 12 }} />
                        </ActionBtn>
                      )}
                      <ActionBtn $danger onClick={() => dispatch(deleteTask(task.id))} title="删除">
                        <DeleteOutlined style={{ fontSize: 12 }} />
                      </ActionBtn>
                    </TaskActions>
                  </TaskHeader>
                  {task.description && <TaskDesc>{task.description}</TaskDesc>}
                  {agent && (
                    <TaskFooter>
                      <MiniAvatar color={AGENT_COLOR_MAP[agent.color] || '#1677ff'}>{agent.avatar}</MiniAvatar>
                      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{agent.name}</span>
                    </TaskFooter>
                  )}
                </TaskCard>
              )
            })}
          </ColumnSection>
        )
      })}
      {convTasks.length === 0 && (
        <Placeholder>
          <p>暂无任务</p>
          <span>PM 会根据需求自动创建任务</span>
        </Placeholder>
      )}
    </div>
  )
}

const AgentTeamPanel: FC = () => {
  const { agents } = useAppSelector((s) => s.workspace)

  return (
    <div>
      <BoardHeader>
        <span>Agent 团队 ({agents.length})</span>
      </BoardHeader>
      {agents.map((agent) => (
        <AgentCard key={agent.id}>
          <AgentAvatarLarge color={AGENT_COLOR_MAP[agent.color] || '#1677ff'}>{agent.avatar}</AgentAvatarLarge>
          <AgentCardInfo>
            <AgentCardName>
              {agent.name}
              {agent.isMain && <MainTag>主 Agent</MainTag>}
            </AgentCardName>
            <AgentCardRole>{agent.role}</AgentCardRole>
            <AgentModelTag>{agent.modelId ? `模型: ${agent.modelId.split('/').pop()}` : '默认模型'}</AgentModelTag>
          </AgentCardInfo>
        </AgentCard>
      ))}
    </div>
  )
}

const KnowledgePanel: FC = () => {
  const dispatch = useAppDispatch()
  const { activeConversationId, conversations } = useAppSelector((s) => s.workspace)
  const knowledgeBases = useAppSelector((s) => s.knowledge.bases)
  const activeConv = conversations.find((c) => c.id === activeConversationId)

  const knowledgeOptions = knowledgeBases.map((kb) => ({
    label: kb.name,
    value: kb.id
  }))

  return (
    <div>
      <BoardHeader>
        <span>知识库</span>
      </BoardHeader>
      {!activeConv ? (
        <Placeholder>
          <p>请先选择一个对话</p>
        </Placeholder>
      ) : (
        <>
          <FieldLabel>关联知识库</FieldLabel>
          <Select
            style={{ width: '100%' }}
            placeholder="选择知识库（可选）"
            allowClear
            value={activeConv.knowledgeBaseId || undefined}
            onChange={(val) =>
              dispatch(
                setConversationKnowledgeBase({
                  conversationId: activeConv.id,
                  knowledgeBaseId: val || null
                })
              )
            }
            options={knowledgeOptions}
            notFoundContent="暂无知识库，请在知识库页面创建"
          />
          {activeConv.knowledgeBaseId && (
            <KBInfo>已关联: {knowledgeBases.find((kb) => kb.id === activeConv.knowledgeBaseId)?.name}</KBInfo>
          )}
        </>
      )}
    </div>
  )
}

const Container = styled.div`
  display: flex;
  height: 100%;
`

const SlidePanel = styled.div<{ $open: boolean }>`
  width: ${({ $open }) => ($open ? '300px' : '0')};
  min-width: ${({ $open }) => ($open ? '300px' : '0')};
  height: 100%;
  overflow: hidden;
  border-left: 0.5px solid var(--color-border);
  background: var(--color-background-soft);
  transition: width 0.3s ease, min-width 0.3s ease;
`

const PanelContent = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 300px;
`

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--color-border);
`

const PanelTitle = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
`

const CloseBtn = styled.button`
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

const PanelBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
`

const IconBar = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  gap: 2px;
  width: 48px;
  min-width: 48px;
  border-left: 0.5px solid var(--color-border);
  background: var(--color-background-soft);
`

const IconBtn = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: ${({ $active }) => ($active ? 'var(--color-active)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--color-primary)' : 'var(--color-text-secondary)')};
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }
`

const BoardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
`

const ColumnSection = styled.div`
  margin-bottom: 12px;
`

const ColumnLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  padding: 4px;
  margin-bottom: 6px;
`

const TaskCard = styled.div`
  background: var(--color-background);
  border: 0.5px solid var(--color-border);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  &:hover {
    border-color: var(--color-primary);
  }
`

const TaskHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
`

const StatusIcon = styled.div`
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 2px;
  &:hover {
    transform: scale(1.2);
  }
`

const TaskTitle = styled.div<{ $done: boolean }>`
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  opacity: ${({ $done }) => ($done ? 0.5 : 1)};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const TaskActions = styled.div`
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
  ${TaskCard}:hover & {
    opacity: 1;
  }
`

const ActionBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${({ $danger }) => ($danger ? 'var(--color-error)' : 'var(--color-text-secondary)')};
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
  }
`

const TaskDesc = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  padding-left: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const TaskFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding-left: 20px;
`

const MiniAvatar = styled.div<{ color: string }>`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 600;
  color: ${({ color }) => color};
  background: ${({ color }) => color}18;
`

const Placeholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  text-align: center;
  p {
    font-size: 13px;
    color: var(--color-text);
    margin-bottom: 4px;
  }
  span {
    font-size: 11px;
    color: var(--color-text-secondary);
  }
`

const AgentCard = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 4px;
  &:hover {
    background: var(--color-hover);
  }
`

const AgentAvatarLarge = styled.div<{ color: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: ${({ color }) => color};
  background: ${({ color }) => color}18;
  flex-shrink: 0;
`

const AgentCardInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const AgentCardName = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
`

const MainTag = styled.span`
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
`

const AgentCardRole = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
`

const AgentModelTag = styled.div`
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-top: 2px;
  opacity: 0.7;
`

const FieldLabel = styled.div`
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
`

const KBInfo = styled.div`
  font-size: 11px;
  color: var(--color-primary);
  margin-top: 8px;
  padding: 6px 8px;
  background: var(--color-active);
  border-radius: 6px;
`

export default ToolPanel
