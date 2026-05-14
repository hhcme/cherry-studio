import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setActiveFile } from '@renderer/store/workspace'
import type { NotesTreeNode } from '@renderer/types/note'
import { Alert, Spin, Tooltip } from 'antd'
import { FilePlus, FolderOpen, RefreshCw } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { styled } from 'styled-components'

const FileBrowserPanel: FC = () => {
  const dispatch = useAppDispatch()
  const { activeConversationId, conversations } = useAppSelector((s) => s.workspace)
  const activeConv = conversations.find((c) => c.id === activeConversationId)
  const activeFile = useAppSelector((s) => s.workspace.activeFile)

  const [tree, setTree] = useState<NotesTreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workDir = activeConv?.workDir

  const loadTree = useCallback(async () => {
    if (!workDir) {
      setTree([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.file.getDirectoryStructure(workDir)
      setTree(result || [])
    } catch (err: any) {
      setError(err.message || '加载文件树失败')
    } finally {
      setLoading(false)
    }
  }, [workDir])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  const handleCreateFile = async () => {
    if (!workDir) return
    const name = prompt('文件名:', 'untitled.md')
    if (!name) return
    try {
      await window.api.file.write(`${workDir}/${name}`, '')
      await loadTree()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleCreateFolder = async () => {
    if (!workDir) return
    const name = prompt('文件夹名:')
    if (!name) return
    try {
      await window.api.file.mkdir(`${workDir}/${name}`)
      await loadTree()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleOpenFile = async (node: NotesTreeNode) => {
    if (node.type === 'folder') return
    dispatch(setActiveFile(node.externalPath))
  }

  const handleOpenInSystem = async (node: NotesTreeNode) => {
    try {
      await window.api.file.openPath(node.externalPath)
    } catch {}
  }

  if (!activeConversationId || !workDir) {
    return (
      <Placeholder>
        <p>文件浏览器</p>
        <span>{!activeConversationId ? '请先选择一个对话' : '该对话尚未初始化工作目录'}</span>
      </Placeholder>
    )
  }

  return (
    <div>
      <Header>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{workDir}</span>
        <HeaderActions>
          <Tooltip title="新建文件">
            <ActionBtn onClick={handleCreateFile}>
              <FilePlus size={14} />
            </ActionBtn>
          </Tooltip>
          <Tooltip title="新建文件夹">
            <ActionBtn onClick={handleCreateFolder}>
              <FolderOpen size={14} />
            </ActionBtn>
          </Tooltip>
          <Tooltip title="刷新">
            <ActionBtn onClick={loadTree}>
              <RefreshCw size={14} />
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

      {!loading && tree.length === 0 && <EmptyHint>工作目录为空，点击上方按钮创建文件</EmptyHint>}

      <TreeContainer>{renderNodes(tree, 0, activeFile, handleOpenFile, handleOpenInSystem)}</TreeContainer>
    </div>
  )
}

function renderNodes(
  nodes: NotesTreeNode[],
  depth: number,
  activeFile: string | null,
  onSelect: (node: NotesTreeNode) => void,
  onOpenInSystem: (node: NotesTreeNode) => void
): React.ReactNode {
  return nodes.map((node) => (
    <TreeNodeRow key={node.id} $depth={depth} $active={node.externalPath === activeFile} onClick={() => onSelect(node)}>
      <Indent $depth={depth} />
      <NodeIcon>{node.type === 'folder' ? '📁' : fileIcon(node.name)}</NodeIcon>
      <NodeName>{node.name}</NodeName>
      <NodeActions>
        <SmallActionBtn
          onClick={(e) => {
            e.stopPropagation()
            onOpenInSystem(node)
          }}
          title="在系统中打开">
          <FolderOpen size={10} />
        </SmallActionBtn>
      </NodeActions>
      {node.type === 'folder' && node.children && node.children.length > 0 && (
        <ChildContainer>{renderNodes(node.children, depth + 1, activeFile, onSelect, onOpenInSystem)}</ChildContainer>
      )}
    </TreeNodeRow>
  ))
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: '📘',
    tsx: '📘',
    js: '📒',
    jsx: '📒',
    py: '🐍',
    md: '📝',
    json: '📋',
    html: '🌐',
    css: '🎨',
    yaml: '⚙️',
    yml: '⚙️',
    txt: '📄'
  }
  return map[ext] || '📄'
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

const TreeContainer = styled.div`
  font-size: 12px;
`

const TreeNodeRow = styled.div<{ $depth: number; $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  cursor: pointer;
  border-radius: 4px;
  background: ${({ $active }) => ($active ? 'var(--color-active)' : 'transparent')};
  &:hover {
    background: ${({ $active }) => ($active ? 'var(--color-active)' : 'var(--color-hover)')};
  }
`

const Indent = styled.span<{ $depth: number }>`
  width: ${({ $depth }) => $depth * 16}px;
  flex-shrink: 0;
`

const NodeIcon = styled.span`
  font-size: 14px;
  flex-shrink: 0;
  line-height: 1;
`

const NodeName = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
`

const NodeActions = styled.span`
  display: none;
  gap: 2px;
  ${TreeNodeRow}:hover & {
    display: flex;
  }
`

const SmallActionBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  &:hover {
    color: var(--color-primary);
  }
`

const ChildContainer = styled.div`
  display: flex;
  flex-direction: column;
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

export default FileBrowserPanel
