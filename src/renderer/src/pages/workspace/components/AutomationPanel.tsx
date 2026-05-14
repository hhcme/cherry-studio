import { DeleteOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAgentClient } from '@renderer/hooks/agents/useAgentClient'
import { useSettings } from '@renderer/hooks/useSettings'
import type { ScheduledTaskEntity } from '@renderer/types/agent'
import { Alert, Button, Input, Select, Spin, Tooltip } from 'antd'
import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { styled } from 'styled-components'

const AutomationPanel: FC = () => {
  const agentClient = useAgentClient()
  const { apiServer } = useSettings()

  const [tasks, setTasks] = useState<ScheduledTaskEntity[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadTasks = useCallback(async () => {
    if (!apiServer?.enabled) return
    setLoading(true)
    setError(null)
    try {
      const result = await agentClient.listTasks()
      setTasks(result.data)
    } catch (err: any) {
      setError(err.message || '加载任务失败')
    } finally {
      setLoading(false)
    }
  }, [agentClient, apiServer?.enabled])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const handleDelete = async (taskId: string) => {
    try {
      await agentClient.deleteTask(taskId)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleRun = async (taskId: string) => {
    try {
      await agentClient.runTask(taskId)
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (!apiServer?.enabled) {
    return (
      <Placeholder>
        <p>自动化任务</p>
        <span>需要启用 API Server 才能使用定时任务功能</span>
      </Placeholder>
    )
  }

  return (
    <div>
      <Header>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>定时任务 ({tasks.length})</span>
        <HeaderActions>
          <Tooltip title="刷新">
            <ActionBtn onClick={loadTasks}>
              <ReloadOutlined style={{ fontSize: 14 }} />
            </ActionBtn>
          </Tooltip>
          <Tooltip title="新建任务">
            <ActionBtn onClick={() => setShowCreate(!showCreate)}>
              <PlusOutlined style={{ fontSize: 14 }} />
            </ActionBtn>
          </Tooltip>
        </HeaderActions>
      </Header>

      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError(null)}
          style={{ margin: '8px 0', fontSize: 12 }}
        />
      )}

      {loading && (
        <SpinContainer>
          <Spin size="small" />
        </SpinContainer>
      )}

      {showCreate && (
        <CreateTaskForm
          agentClient={agentClient}
          onCreated={() => {
            setShowCreate(false)
            void loadTasks()
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {!loading && tasks.length === 0 && !showCreate && <EmptyHint>暂无定时任务，点击 + 创建</EmptyHint>}

      {tasks.map((task) => (
        <TaskCard key={task.id}>
          <TaskHeader>
            <TaskName>{task.name}</TaskName>
            <StatusTag $status={task.status}>{statusLabel(task.status)}</StatusTag>
          </TaskHeader>
          <TaskMeta>
            <span>{scheduleLabel(task.schedule_type, task.schedule_value)}</span>
            <span>超时: {task.timeout_minutes}分钟</span>
          </TaskMeta>
          {task.last_run && (
            <TaskMeta>
              <span>上次运行: {new Date(task.last_run).toLocaleString('zh-CN')}</span>
            </TaskMeta>
          )}
          {task.last_result && (
            <ResultPreview>
              {task.last_result.slice(0, 100)}
              {task.last_result.length > 100 ? '...' : ''}
            </ResultPreview>
          )}
          <TaskActions>
            <SmallActionBtn onClick={() => void handleRun(task.id)} title="立即运行">
              <PlayCircleOutlined style={{ fontSize: 12 }} />
            </SmallActionBtn>
            <SmallActionBtn $danger onClick={() => void handleDelete(task.id)} title="删除">
              <DeleteOutlined style={{ fontSize: 12 }} />
            </SmallActionBtn>
          </TaskActions>
        </TaskCard>
      ))}
    </div>
  )
}

const CreateTaskForm: FC<{
  agentClient: any
  onCreated: () => void
  onCancel: () => void
}> = ({ agentClient, onCreated, onCancel }) => {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval' | 'once'>('interval')
  const [scheduleValue, setScheduleValue] = useState('60')

  const handleCreate = async () => {
    if (!name.trim() || !prompt.trim()) return
    try {
      await agentClient.createTask('default-agent', {
        name: name.trim(),
        prompt: prompt.trim(),
        schedule_type: scheduleType,
        schedule_value: scheduleValue
      })
      onCreated()
    } catch {}
  }

  return (
    <FormContainer>
      <FieldLabel>任务名称</FieldLabel>
      <Input size="small" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 每日代码审查" />
      <FieldLabel style={{ marginTop: 8 }}>执行提示词</FieldLabel>
      <Input.TextArea
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Agent 每次执行时收到的指令..."
      />
      <FieldLabel style={{ marginTop: 8 }}>调度类型</FieldLabel>
      <Select
        style={{ width: '100%' }}
        size="small"
        value={scheduleType}
        onChange={(val) => setScheduleType(val)}
        options={[
          { label: '定时 (Cron)', value: 'cron' },
          { label: '间隔 (分钟)', value: 'interval' },
          { label: '一次性', value: 'once' }
        ]}
      />
      <FieldLabel style={{ marginTop: 8 }}>调度值</FieldLabel>
      <Input
        size="small"
        value={scheduleValue}
        onChange={(e) => setScheduleValue(e.target.value)}
        placeholder={
          scheduleType === 'cron' ? '0 9 * * *' : scheduleType === 'interval' ? '60' : '2026-06-01T09:00:00Z'
        }
      />
      <FormActions>
        <Button size="small" onClick={onCancel}>
          取消
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => void handleCreate()}
          disabled={!name.trim() || !prompt.trim()}>
          创建
        </Button>
      </FormActions>
    </FormContainer>
  )
}

function statusLabel(status: string): string {
  const map: Record<string, string> = { active: '活跃', paused: '暂停', completed: '完成' }
  return map[status] || status
}

function scheduleLabel(type: string, value: string): string {
  if (type === 'interval') return `每 ${value} 分钟`
  if (type === 'cron') return `Cron: ${value}`
  if (type === 'once') return `一次性: ${new Date(value).toLocaleString('zh-CN')}`
  return value
}

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
`

const HeaderActions = styled.div`
  display: flex;
  gap: 2px;
`

const ActionBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
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

const SpinContainer = styled.div`
  display: flex;
  justify-content: center;
  padding: 20px;
`

const EmptyHint = styled.div`
  text-align: center;
  font-size: 11px;
  color: var(--color-text-secondary);
  padding: 20px 0;
`

const TaskCard = styled.div`
  background: var(--color-background);
  border: 0.5px solid var(--color-border);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 6px;
  position: relative;
  &:hover {
    border-color: var(--color-primary);
  }
`

const TaskHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const TaskName = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StatusTag = styled.span<{ $status: string }>`
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 500;
  ${({ $status }) =>
    $status === 'active'
      ? 'background: color-mix(in srgb, #52c41a 12%, transparent); color: #52c41a;'
      : $status === 'paused'
        ? 'background: color-mix(in srgb, #faad14 12%, transparent); color: #faad14;'
        : 'background: var(--color-background-soft); color: var(--color-text-secondary);'}
`

const TaskMeta = styled.div`
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-top: 4px;
`

const ResultPreview = styled.div`
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  padding: 4px 6px;
  background: var(--color-background-soft);
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TaskActions = styled.div`
  display: flex;
  gap: 2px;
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity 0.2s;
  ${TaskCard}:hover & {
    opacity: 1;
  }
`

const SmallActionBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${({ $danger }) => ($danger ? 'var(--color-error)' : 'var(--color-text-secondary)')};
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
  }
`

const FormContainer = styled.div`
  background: var(--color-background);
  border: 0.5px solid var(--color-border);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
`

const FieldLabel = styled.div`
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
`

const FormActions = styled.div`
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 10px;
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

export default AutomationPanel
