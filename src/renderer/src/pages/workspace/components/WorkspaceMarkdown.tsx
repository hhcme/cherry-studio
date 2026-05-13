import { type FC, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { styled } from 'styled-components'

interface Props {
  content: string
}

const WorkspaceMarkdown: FC<Props> = ({ content }) => {
  return (
    <Wrapper className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;

  p {
    margin: 0 0 8px;
    &:last-child {
      margin-bottom: 0;
    }
  }

  h1, h2, h3, h4, h5, h6 {
    margin: 12px 0 8px;
    font-weight: 600;
    line-height: 1.4;
  }
  h1 { font-size: 1.4em; }
  h2 { font-size: 1.25em; }
  h3 { font-size: 1.1em; }

  ul, ol {
    margin: 4px 0;
    padding-left: 20px;
  }
  li { margin: 2px 0; }

  blockquote {
    margin: 8px 0;
    padding: 4px 12px;
    border-left: 3px solid var(--color-primary);
    background: var(--color-background-soft);
    border-radius: 0 4px 4px 0;
    color: var(--color-text-secondary);
  }

  code {
    font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.9em;
    background: color-mix(in srgb, var(--color-text) 8%, transparent);
    padding: 2px 6px;
    border-radius: 4px;
  }

  pre {
    margin: 8px 0;
    padding: 12px;
    background: var(--color-background-soft);
    border: 0.5px solid var(--color-border);
    border-radius: 8px;
    overflow-x: auto;

    code {
      background: none;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
    }
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 12px;
    th, td {
      border: 0.5px solid var(--color-border);
      padding: 6px 10px;
      text-align: left;
    }
    th {
      background: var(--color-background-soft);
      font-weight: 600;
    }
  }

  hr {
    border: none;
    border-top: 0.5px solid var(--color-border);
    margin: 12px 0;
  }

  a {
    color: var(--color-primary);
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }

  strong { font-weight: 600; }
`

export default memo(WorkspaceMarkdown)
