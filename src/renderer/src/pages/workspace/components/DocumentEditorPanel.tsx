import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setActiveFile } from '@renderer/store/workspace'
import { Alert, Spin, Tooltip } from 'antd'
import { Save, X } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'

const DocumentEditorPanel: FC = () => {
  const dispatch = useAppDispatch()
  const activeFile = useAppSelector((s) => s.workspace.activeFile)

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadFile = useCallback(async () => {
    if (!activeFile) {
      setContent('')
      return
    }
    setLoading(true)
    setError(null)
    setDirty(false)
    try {
      const isText = await window.api.file.isTextFile(activeFile)
      if (!isText) {
        setError('该文件不是文本文件，无法编辑')
        return
      }
      const text = await window.api.file.readExternal(activeFile, true)
      setContent(text || '')
    } catch (err: any) {
      setError(err.message || '读取文件失败')
    } finally {
      setLoading(false)
    }
  }, [activeFile])

  useEffect(() => {
    void loadFile()
  }, [loadFile])

  const handleSave = async () => {
    if (!activeFile || !dirty) return
    setSaving(true)
    try {
      await window.api.file.write(activeFile, content)
      setDirty(false)
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      void handleSave()
    }
  }

  if (!activeFile) {
    return (
      <Placeholder>
        <p>文档编辑器</p>
        <span>从文件浏览器选择一个文件开始编辑</span>
      </Placeholder>
    )
  }

  const fileName = activeFile.split('/').pop() || activeFile

  return (
    <div>
      <EditorHeader>
        <FileInfo>
          <FileName>{fileName}</FileName>
          {dirty && <DirtyMark>未保存</DirtyMark>}
        </FileInfo>
        <HeaderActions>
          <Tooltip title="保存 (Cmd+S)">
            <ActionBtn onClick={handleSave} disabled={!dirty || saving}>
              <Save size={14} />
            </ActionBtn>
          </Tooltip>
          <Tooltip title="关闭">
            <ActionBtn onClick={() => dispatch(setActiveFile(null))}>
              <X size={14} />
            </ActionBtn>
          </Tooltip>
        </HeaderActions>
      </EditorHeader>

      <FilePath>{activeFile}</FilePath>

      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError(null)}
          style={{ margin: '8px 0', fontSize: 12 }}
        />
      )}

      {loading ? (
        <SpinContainer>
          <Spin size="small" />
        </SpinContainer>
      ) : (
        <CodeArea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            setDirty(true)
          }}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
      )}
    </div>
  )
}

const EditorHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
`

const FileInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
`

const FileName = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const DirtyMark = styled.span`
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
  flex-shrink: 0;
`

const FilePath = styled.div`
  font-size: 10px;
  color: var(--color-text-secondary);
  padding: 0 4px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
`

const HeaderActions = styled.div`
  display: flex;
  gap: 2px;
`

const ActionBtn = styled.button<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ disabled }) => (disabled ? 'var(--color-text-secondary)' : 'var(--color-text-secondary)')};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.4 : 1)};
  &:hover:not(:disabled) {
    background: var(--color-hover);
    color: var(--color-text);
  }
`

const SpinContainer = styled.div`
  display: flex;
  justify-content: center;
  padding: 20px;
`

const CodeArea = styled.textarea`
  width: 100%;
  height: calc(100% - 80px);
  min-height: 200px;
  padding: 8px;
  border: 0.5px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text);
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: none;
  outline: none;
  &:focus {
    border-color: var(--color-primary);
  }
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

export default DocumentEditorPanel
