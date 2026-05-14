import 'katex/dist/katex.min.css'

import { CodeBlockView } from '@renderer/components/CodeBlockView'
import ImageViewer from '@renderer/components/ImageViewer'
import { useSettings } from '@renderer/hooks/useSettings'
import { removeSvgEmptyLines } from '@renderer/utils/formats'
import { processLatexBrackets } from '@renderer/utils/markdown'
import { type FC, memo, useMemo } from 'react'
import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { styled } from 'styled-components'

interface Props {
  content: string
}

const ALLOWED_ELEMENTS =
  /<(style|p|div|span|b|i|strong|em|ul|ol|li|table|tr|td|th|thead|tbody|h[1-6]|blockquote|pre|code|br|hr|svg|path|circle|rect|line|polyline|polygon|text|g|defs|title|desc|tspan|sub|sup|details|summary)/i

const WorkspaceCodeBlock: FC<{ children: string; className?: string }> = ({ children, className }) => {
  const languageMatch = /language-([\w-+]+)/.exec(className || '')
  const language = languageMatch?.[1] ?? (children?.includes('\n') ? 'text' : null)

  if (language !== null) {
    return <CodeBlockView language={language}>{children}</CodeBlockView>
  }

  return (
    <code className={className} style={{ textWrap: 'wrap', fontSize: '95%', padding: '2px 4px' }}>
      {children}
    </code>
  )
}

const WorkspaceMarkdown: FC<Props> = ({ content }) => {
  const { mathEngine, mathEnableSingleDollar } = useSettings()

  const processedContent = useMemo(() => {
    return removeSvgEmptyLines(processLatexBrackets(content))
  }, [content])

  const remarkPlugins = useMemo(() => {
    const plugins: any[] = [[remarkGfm, { singleTilde: false }]]
    if (mathEngine === 'KaTeX') {
      plugins.push([remarkMath, { singleDollarTextMath: mathEnableSingleDollar }])
    }
    return plugins
  }, [mathEngine, mathEnableSingleDollar])

  const rehypePlugins = useMemo(() => {
    const plugins: any[] = []
    if (ALLOWED_ELEMENTS.test(processedContent)) {
      plugins.push(rehypeRaw)
    }
    if (mathEngine === 'KaTeX') {
      plugins.push(rehypeKatex)
    }
    return plugins
  }, [mathEngine, processedContent])

  const components = useMemo(
    () =>
      ({
        code: (props: any) => <WorkspaceCodeBlock {...props} />,
        img: (props: any) => <ImageViewer style={{ maxWidth: 500, maxHeight: 500 }} {...props} />,
        pre: (props: any) => <pre style={{ overflow: 'visible' }} {...props} />
      }) as Partial<Components>,
    []
  )

  return (
    <Wrapper className="markdown">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={defaultUrlTransform}>
        {processedContent}
      </ReactMarkdown>
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
