import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  SettingOutlined,
  TeamOutlined
} from '@ant-design/icons'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { Button, Dropdown, Input, Select, Tooltip } from 'antd'
import type { FC } from 'react'
const { TextArea } = Input
import { useProviders } from '@renderer/hooks/useProvider'
import {
  addAgent,
  createConversation,
  deleteConversation,
  removeAgent,
  renameConversation,
  setActiveConversation,
  updateAgent
} from '@renderer/store/workspace'
import type { MenuProps } from 'antd'
import { MessageSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

const WorkspaceSidebar: FC = () => {
  const dispatch = useAppDispatch()
  const { conversations, activeConversationId, agents, leftPanelCollapsed } = useAppSelector((s) => s.workspace)

  const [showAgentCreate, setShowAgentCreate] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)

  const handleNewConversation = () => {
    const count = conversations.length + 1
    dispatch(createConversation({ name: `新对话 ${count}`, agentIds: agents.map((a) => a.id) }))
  }

  if (leftPanelCollapsed) {
    return (
      <CollapsedContainer>
        <Tooltip title="展开" placement="right">
          <IconBtn onClick={() => dispatch({ type: 'workspace/toggleLeftPanel' })}>
            <MessageSquare size={16} />
          </IconBtn>
        </Tooltip>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {conversations.map((conv) => (
            <Tooltip key={conv.id} title={conv.name} placement="right">
              <IconBtn
                $active={conv.id === activeConversationId}
                onClick={() => dispatch(setActiveConversation(conv.id))}>
                {conv.name.charAt(0)}
              </IconBtn>
            </Tooltip>
          ))}
        </div>
      </CollapsedContainer>
    )
  }

  return (
    <Container>
      <Header>
        <Title>协作工作台</Title>
        <Tooltip title="折叠">
          <SmallBtn onClick={() => dispatch({ type: 'workspace/toggleLeftPanel' })}>◀</SmallBtn>
        </Tooltip>
      </Header>

      <Section>
        <SectionHeader>
          <SectionLabel>
            <MessageSquare size={14} />
            对话
          </SectionLabel>
          <Tooltip title="新建对话">
            <SmallBtn onClick={handleNewConversation}>
              <PlusOutlined style={{ fontSize: 12 }} />
            </SmallBtn>
          </Tooltip>
        </SectionHeader>
        {conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            agents={agents}
            isActive={conv.id === activeConversationId}
            onSelect={() => dispatch(setActiveConversation(conv.id))}
            onDelete={() => dispatch(deleteConversation(conv.id))}
            onRename={(name) => dispatch(renameConversation({ id: conv.id, name }))}
          />
        ))}
        {conversations.length === 0 && (
          <EmptyText>
            暂无对话
            <Button size="small" type="link" onClick={handleNewConversation}>
              新建
            </Button>
          </EmptyText>
        )}
      </Section>

      <Section>
        <SectionHeader>
          <SectionLabel>
            <TeamOutlined style={{ fontSize: 14 }} />
            Agent 池
          </SectionLabel>
          <Tooltip title="新建 Agent">
            <SmallBtn onClick={() => setShowAgentCreate(true)}>
              <PlusOutlined style={{ fontSize: 12 }} />
            </SmallBtn>
          </Tooltip>
        </SectionHeader>
        {agents.map((agent) => (
          <AgentRow key={agent.id}>
            <AgentAvatar color={AGENT_COLOR_MAP[agent.color] || '#1677ff'}>{agent.avatar}</AgentAvatar>
            <AgentInfo>
              <AgentName>{agent.name}</AgentName>
              <AgentRole>{agent.role}</AgentRole>
            </AgentInfo>
            <Tooltip title="设置">
              <SmallBtn onClick={() => setEditingAgentId(agent.id)}>
                <SettingOutlined style={{ fontSize: 11 }} />
              </SmallBtn>
            </Tooltip>
          </AgentRow>
        ))}
      </Section>

      {showAgentCreate && <AgentCreateModal onClose={() => setShowAgentCreate(false)} />}

      {editingAgentId && <AgentEditModal agentId={editingAgentId} onClose={() => setEditingAgentId(null)} />}
    </Container>
  )
}

const ConversationItem: FC<{
  conversation: { id: string; name: string; agentIds: string[] }
  agents: { id: string; name: string; avatar: string; color: string }[]
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (name: string) => void
}> = ({ conversation, agents, isActive, onSelect, onDelete, onRename }) => {
  const [isRenaming, setIsRenaming] = useState(false)
  const [name, setName] = useState(conversation.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const convAgents = agents.filter((a) => conversation.agentIds.includes(a.id))

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isRenaming])

  const menuItems: MenuProps['items'] = [
    {
      key: 'rename',
      label: '重命名',
      icon: <EditOutlined />,
      onClick: () => {
        setName(conversation.name)
        setIsRenaming(true)
      }
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: onDelete
    }
  ]

  if (isRenaming) {
    return (
      <ConvItem $active={false} style={{ padding: '4px 8px' }}>
        <Input
          size="small"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim()) onRename(name.trim())
            setIsRenaming(false)
          }}
          onPressEnter={() => {
            if (name.trim()) onRename(name.trim())
            setIsRenaming(false)
          }}
          ref={inputRef as any}
        />
      </ConvItem>
    )
  }

  return (
    <ConvItem $active={isActive} onClick={onSelect}>
      <ConvName>{conversation.name}</ConvName>
      <ConvFooter>
        {convAgents.map((a) => (
          <MiniAvatar key={a.id} color={AGENT_COLOR_MAP[a.color] || '#1677ff'} title={a.name}>
            {a.avatar}
          </MiniAvatar>
        ))}
      </ConvFooter>
      {isActive && (
        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <MoreBtn onClick={(e) => e.stopPropagation()}>
            <MoreOutlined style={{ fontSize: 14 }} />
          </MoreBtn>
        </Dropdown>
      )}
    </ConvItem>
  )
}

const AgentEditModal: FC<{ agentId: string; onClose: () => void }> = ({ agentId, onClose }) => {
  const dispatch = useAppDispatch()
  const agent = useAppSelector((s) => s.workspace.agents.find((a) => a.id === agentId))
  const { providers } = useProviders()
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '')
  const [modelId, setModelId] = useState(agent?.modelId || '')

  if (!agent) return null

  const allModels = providers
    .flatMap((p) => p.models.map((m) => ({ ...m, providerName: p.name })))
    .map((m) => ({ label: `${m.name} (${m.providerName})`, value: m.id }))

  const handleSave = () => {
    dispatch(updateAgent({ id: agentId, updates: { systemPrompt, modelId: modelId || undefined } }))
    onClose()
  }

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalTitle>编辑 {agent.name}</ModalTitle>
        <FieldLabel>模型</FieldLabel>
        <Select
          style={{ width: '100%' }}
          placeholder="使用默认模型"
          allowClear
          value={modelId || undefined}
          onChange={(val) => setModelId(val || '')}
          options={allModels}
          showSearch
          filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
        />
        <FieldLabel style={{ marginTop: 12 }}>系统提示词</FieldLabel>
        <TextArea
          rows={4}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="定义 Agent 的角色和行为..."
        />
        <FieldLabel style={{ marginTop: 12 }}>操作</FieldLabel>
        <Button
          danger
          size="small"
          onClick={() => {
            dispatch(removeAgent(agentId))
            onClose()
          }}>
          删除此 Agent
        </Button>
        <ModalActions>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存
          </Button>
        </ModalActions>
      </ModalContent>
    </ModalOverlay>
  )
}

const AgentCreateModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const dispatch = useAppDispatch()
  const [name, setName] = useState('')
  const [role, setRole] = useState('后端开发工程师')

  const roles = [
    '后端开发工程师',
    '前端开发工程师',
    'UI/UX 设计师',
    '产品经理',
    '测试工程师',
    'DevOps 工程师',
    '数据分析师',
    '技术文档工程师'
  ]

  const handleCreate = () => {
    if (!name.trim()) return
    dispatch(addAgent({ name: name.trim(), role, isMain: false }))
    onClose()
  }

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalTitle>新建 Agent</ModalTitle>
        <FieldLabel>名称</FieldLabel>
        <Input
          placeholder="例如: Dev, Design, QA..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={handleCreate}
          autoFocus
        />
        <FieldLabel style={{ marginTop: 12 }}>角色</FieldLabel>
        <SelectWrapper value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectWrapper>
        <ModalActions>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleCreate}>
            创建
          </Button>
        </ModalActions>
      </ModalContent>
    </ModalOverlay>
  )
}

const Container = styled.div`
  width: 260px;
  min-width: 260px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);
  border-right: 0.5px solid var(--color-border);
  overflow: hidden;
`

const CollapsedContainer = styled.div`
  width: 48px;
  min-width: 48px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  background: var(--color-background-soft);
  border-right: 0.5px solid var(--color-border);
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
`

const Title = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const Section = styled.div`
  padding: 4px 8px;
  margin-bottom: 8px;
`

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 6px;
`

const SectionLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-transform: uppercase;
`

const SmallBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ $danger }) => ($danger ? 'var(--color-error)' : 'var(--color-text-secondary)')};
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
  }
`

const IconBtn = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--color-active)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--color-primary)' : 'var(--color-text-secondary)')};
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  &:hover {
    background: var(--color-hover);
  }
`

const ConvItem = styled.div<{ $active: boolean }>`
  position: relative;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
  background: ${({ $active }) => ($active ? 'var(--color-active)' : 'transparent')};
  &:hover {
    background: ${({ $active }) => ($active ? 'var(--color-active)' : 'var(--color-hover)')};
  }
`

const ConvName = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const ConvFooter = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 4px;
`

const MoreBtn = styled.button`
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
  }
`

const MiniAvatar = styled.div<{ color: string }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: ${({ color }) => color};
  background: ${({ color }) => color}18;
`

const AgentRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
  }
`

const AgentAvatar = styled.div<{ color: string }>`
  width: 28px;
  height: 28px;
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

const AgentInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const AgentName = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
`

const AgentRole = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const EmptyText = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
  padding: 12px 0;
`

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
`

const ModalContent = styled.div`
  background: var(--color-background);
  border: 0.5px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  width: 340px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
`

const ModalTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16px;
`

const FieldLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
`

const SelectWrapper = styled.select`
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  border: 0.5px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 13px;
  outline: none;
  &:focus {
    border-color: var(--color-primary);
  }
`

const ModalActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
`

export default WorkspaceSidebar
