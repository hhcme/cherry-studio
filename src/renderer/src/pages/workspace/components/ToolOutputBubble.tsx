import type { WorkspaceMessage } from '@renderer/store/workspace'
import { AlertTriangle, CheckCircle, Code, FileEdit, FileSearch, Loader2, Terminal, Wrench } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import { styled } from 'styled-components'

const ToolOutputBubble: FC<{ msg: WorkspaceMessage }> = ({ msg }) => {
  const [expanded, setExpanded] = useState(false)
  const toolData = msg.toolData

  if (!toolData) {
    return (
      <ToolCard>
        <ToolHeader>
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
        </ToolBody>
      )}
    </ToolCard>
  )
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

export default ToolOutputBubble
