import CodeViewer from '@renderer/components/CodeViewer'
import { getLanguageByFilePath } from '@renderer/utils/code-language'
import { AlertTriangle, CheckCircle, Code, FileEdit, FileSearch, Loader2, Terminal, Wrench } from 'lucide-react'
import { type FC, useState } from 'react'
import { styled } from 'styled-components'

import type { WorkspaceMessage } from '../../../store/workspace'

const ToolOutputBubble: FC<{ msg: WorkspaceMessage }> = ({ msg }) => {
  const [expanded, setExpanded] = useState(false)
  const toolData = msg.toolData

  if (!toolData) {
    return (
      <ToolCard>
        <ToolHeader onClick={() => setExpanded(!expanded)}>
          <Wrench size={12} />
          <ToolLabel>{msg.content}</ToolLabel>
        </ToolHeader>
      </ToolCard>
    )
  }

  const icon = getToolIcon(toolData.toolName)
  const statusIcon =
    toolData.status === 'running' ? (
      <Loader2 size={12} className="spin" />
    ) : toolData.status === 'error' ? (
      <AlertTriangle size={12} color="#ff4d4f" />
    ) : (
      <CheckCircle size={12} color="#52c41a" />
    )

  return (
    <ToolCard>
      <ToolHeader onClick={() => setExpanded(!expanded)}>
        {icon}
        <ToolLabel>
          {toolData.toolName}
          {toolData.filePath ? ` — ${toolData.filePath.split('/').pop()}` : ''}
        </ToolLabel>
        <StatusWrap>{statusIcon}</StatusWrap>
      </ToolHeader>

      {expanded && (
        <ToolBody>
          <SpecializedToolContent toolData={toolData} />
        </ToolBody>
      )}
    </ToolCard>
  )
}

function SpecializedToolContent({ toolData }: { toolData: NonNullable<WorkspaceMessage['toolData']> }) {
  const name = toolData.toolName.toLowerCase()
  const input = toolData.input || {}

  if (name.includes('bash') || name.includes('exec')) {
    return <BashContent command={input.command} description={input.description} output={toolData.output} />
  }

  if (name.includes('edit') || name.includes('multiedit')) {
    return <EditContent input={input} output={toolData.output} />
  }

  if (name.includes('read')) {
    return <ReadContent input={input} output={toolData.output} />
  }

  if (name.includes('write')) {
    return <WriteContent input={input} output={toolData.output} />
  }

  if (name.includes('glob')) {
    return <GlobContent input={input} output={toolData.output} />
  }

  if (name.includes('grep') || name.includes('search')) {
    return <GrepContent input={input} output={toolData.output} />
  }

  return <GenericContent toolData={toolData} />
}

function BashContent({ command, description, output }: { command?: string; description?: string; output?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {command && (
        <Section>
          <SectionLabel>命令{description ? ` — ${description}` : ''}</SectionLabel>
          <TerminalPre>{command}</TerminalPre>
        </Section>
      )}
      {output && (
        <Section>
          <SectionLabel>输出</SectionLabel>
          <TerminalPre>{truncateStr(output, 2000)}</TerminalPre>
        </Section>
      )}
    </div>
  )
}

function EditContent({ input, output }: { input: Record<string, any>; output?: string }) {
  const filePath = input.file_path
  const oldStr = input.old_string || ''
  const newStr = input.new_string || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {filePath && <FilePathRow>{filePath}</FilePathRow>}
      {oldStr && (
        <Section>
          <SectionLabel>替换前</SectionLabel>
          <RemovedBlock>{truncateStr(oldStr, 1000)}</RemovedBlock>
        </Section>
      )}
      {newStr && (
        <Section>
          <SectionLabel>替换后</SectionLabel>
          <AddedBlock>{truncateStr(newStr, 1000)}</AddedBlock>
        </Section>
      )}
      {output && (
        <Section>
          <SectionLabel>结果</SectionLabel>
          <OutputText>{output}</OutputText>
        </Section>
      )}
    </div>
  )
}

function ReadContent({ input, output }: { input: Record<string, any>; output?: string }) {
  const filePath = input.file_path
  const language = getLanguageByFilePath(filePath || '')
  const cleanOutput = stripLineNumbers(output || '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {filePath && <FilePathRow>{filePath}</FilePathRow>}
      {cleanOutput && (
        <CodeViewer
          value={cleanOutput}
          language={language}
          expanded={false}
          wrapped={false}
          maxHeight={240}
          options={{ lineNumbers: true }}
        />
      )}
    </div>
  )
}

function WriteContent({ input, output }: { input: Record<string, any>; output?: string }) {
  const filePath = input.file_path
  const content = input.content || ''
  const language = getLanguageByFilePath(filePath || '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {filePath && <FilePathRow>{filePath}</FilePathRow>}
      {content && (
        <CodeViewer
          value={truncateStr(content, 3000)}
          language={language}
          expanded={false}
          wrapped={false}
          maxHeight={240}
          options={{ lineNumbers: true }}
        />
      )}
      {output && (
        <Section>
          <SectionLabel>结果</SectionLabel>
          <OutputText>{output}</OutputText>
        </Section>
      )}
    </div>
  )
}

function GlobContent({ input, output }: { input: Record<string, any>; output?: string }) {
  const pattern = input.pattern

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pattern && (
        <Section>
          <SectionLabel>模式</SectionLabel>
          <CodeInline>{pattern}</CodeInline>
        </Section>
      )}
      {output && (
        <Section>
          <SectionLabel>匹配文件</SectionLabel>
          <TerminalPre>{truncateStr(output, 2000)}</TerminalPre>
        </Section>
      )}
    </div>
  )
}

function GrepContent({ input, output }: { input: Record<string, any>; output?: string }) {
  const pattern = input.pattern

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pattern && (
        <Section>
          <SectionLabel>搜索</SectionLabel>
          <CodeInline>{pattern}</CodeInline>
          {input.path && <span style={{ marginLeft: 8, color: 'var(--color-text-secondary)' }}>{input.path}</span>}
        </Section>
      )}
      {output && (
        <Section>
          <SectionLabel>结果</SectionLabel>
          <TerminalPre>{truncateStr(output, 2000)}</TerminalPre>
        </Section>
      )}
    </div>
  )
}

function GenericContent({ toolData }: { toolData: NonNullable<WorkspaceMessage['toolData']> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toolData.input && Object.keys(toolData.input).length > 0 && (
        <Section>
          <SectionLabel>输入</SectionLabel>
          <PreBlock>{formatJSON(toolData.input)}</PreBlock>
        </Section>
      )}
      {toolData.output && (
        <Section>
          <SectionLabel>输出</SectionLabel>
          <OutputBlock>{toolData.output}</OutputBlock>
        </Section>
      )}
    </div>
  )
}

function stripLineNumbers(text: string): string {
  return text.replace(/^ *\d+→/gm, '')
}

function truncateStr(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + `\n... (已截断，共 ${text.length} 字符)`
}

function getToolIcon(toolName: string) {
  const name = toolName.toLowerCase()
  if (name.includes('bash') || name.includes('exec')) return <Terminal size={12} color="#52c41a" />
  if (name.includes('edit') || name.includes('write')) return <FileEdit size={12} color="#1677ff" />
  if (name.includes('read') || name.includes('glob') || name.includes('grep') || name.includes('search'))
    return <FileSearch size={12} color="#faad14" />
  return <Code size={12} color="var(--color-text-secondary)" />
}

function formatJSON(obj: Record<string, any>): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

const ToolCard = styled.div`
  background: var(--color-background-soft);
  border: 0.5px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  margin: 4px 0;

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .spin { animation: spin 1s linear infinite; }
`

const ToolHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  &:hover {
    background: var(--color-hover);
  }
`

const ToolLabel = styled.span`
  flex: 1;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StatusWrap = styled.span`
  flex-shrink: 0;
  display: flex;
  align-items: center;
`

const ToolBody = styled.div`
  border-top: 0.5px solid var(--color-border);
  padding: 8px 10px;
`

const Section = styled.div`
  margin-bottom: 8px;
  &:last-child {
    margin-bottom: 0;
  }
`

const SectionLabel = styled.div`
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  margin-bottom: 4px;
`

const PreBlock = styled.pre`
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.4;
  padding: 8px;
  background: var(--color-background);
  border-radius: 6px;
  overflow-x: auto;
  color: var(--color-text);
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
`

const TerminalPre = styled.pre`
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.4;
  padding: 8px;
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;

  [theme-mode='light'] & {
    background: #f5f5f5;
    color: #1e1e1e;
  }
`

const OutputBlock = styled.pre`
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.4;
  padding: 8px;
  background: color-mix(in srgb, #000 5%, var(--color-background));
  border-radius: 6px;
  overflow-x: auto;
  color: var(--color-text);
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
`

const OutputText = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  padding: 4px 0;
`

const RemovedBlock = styled.pre`
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.4;
  padding: 8px;
  background: color-mix(in srgb, #ff4d4f 8%, var(--color-background));
  border-left: 3px solid #ff4d4f;
  border-radius: 6px;
  overflow-x: auto;
  color: var(--color-text);
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
`

const AddedBlock = styled.pre`
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.4;
  padding: 8px;
  background: color-mix(in srgb, #52c41a 8%, var(--color-background));
  border-left: 3px solid #52c41a;
  border-radius: 6px;
  overflow-x: auto;
  color: var(--color-text);
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
`

const FilePathRow = styled.div`
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  color: var(--color-primary);
  padding: 2px 0;
  word-break: break-all;
`

const CodeInline = styled.code`
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
`

export default ToolOutputBubble
