import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useRef, useState } from 'react'
import { styled } from 'styled-components'

const BrowserPanel: FC = () => {
  const [url, setUrl] = useState('https://www.google.com')
  const [inputUrl, setInputUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  const handleNavigate = useCallback(() => {
    let target = inputUrl.trim()
    if (!target) return
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target
    }
    setUrl(target)
    setInputUrl('')
  }, [inputUrl])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate()
    }
  }

  const handleBack = () => webviewRef.current?.goBack()
  const handleForward = () => webviewRef.current?.goForward()
  const handleReload = () => webviewRef.current?.reload()
  const handleOpenExternal = () => {
    if (url) window.open(url, '_blank')
  }

  return (
    <Container>
      <Toolbar>
        <NavBtn onClick={handleBack} title="后退">
          <ArrowLeft size={14} />
        </NavBtn>
        <NavBtn onClick={handleForward} title="前进">
          <ArrowRight size={14} />
        </NavBtn>
        <NavBtn onClick={handleReload} title="刷新">
          <RefreshCw size={14} />
        </NavBtn>
        <AddressBar
          value={inputUrl || url}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入 URL..."
          onFocus={() => setInputUrl(url)}
          onBlur={() => setInputUrl('')}
        />
        <NavBtn onClick={handleOpenExternal} title="在浏览器中打开">
          <ExternalLink size={14} />
        </NavBtn>
      </Toolbar>

      {loading && <LoadingBar />}

      <WebviewWrapper>
        {url && (
          <webview
            ref={(el: any) => {
              webviewRef.current = el
              if (el) {
                el.addEventListener('did-start-loading', () => setLoading(true))
                el.addEventListener('did-stop-loading', () => setLoading(false))
              }
            }}
            src={url}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        )}
      </WebviewWrapper>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  border-bottom: 0.5px solid var(--color-border);
`

const NavBtn = styled.button`
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
  flex-shrink: 0;
  &:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }
`

const AddressBar = styled.input`
  flex: 1;
  padding: 4px 10px;
  border: 0.5px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 12px;
  outline: none;
  min-width: 0;
  &:focus {
    border-color: var(--color-primary);
  }
`

const LoadingBar = styled.div`
  height: 2px;
  background: var(--color-primary);
  animation: loading 1.5s ease-in-out infinite;
  @keyframes loading {
    0% { width: 0%; }
    50% { width: 70%; }
    100% { width: 100%; }
  }
`

const WebviewWrapper = styled.div`
  flex: 1;
  overflow: hidden;
`

export default BrowserPanel
