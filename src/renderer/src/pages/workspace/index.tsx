import { useAppDispatch, useAppSelector } from '@renderer/store'
import { createConversation, setRightPanel, toggleLeftPanel } from '@renderer/store/workspace'
import { AnimatePresence, motion } from 'framer-motion'
import type { FC } from 'react'
import { useCallback, useEffect } from 'react'
import styled from 'styled-components'

import MultiAgentChat from './components/MultiAgentChat'
import ToolPanel from './components/ToolPanel'
import WorkspaceSidebar from './components/WorkspaceSidebar'

const WorkspacePage: FC = () => {
  const dispatch = useAppDispatch()
  const { conversations, rightPanel } = useAppSelector((s) => s.workspace)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (isMeta && e.key === 'n') {
        e.preventDefault()
        const count = conversations.length + 1
        dispatch(createConversation({ name: `新对话 ${count}`, agentIds: [] }))
      }
      if (e.key === 'Escape') {
        if (rightPanel) {
          dispatch(setRightPanel(null))
        }
      }
      if (isMeta && e.shiftKey && e.key === 'b') {
        e.preventDefault()
        dispatch(toggleLeftPanel())
      }
    },
    [dispatch, conversations.length, rightPanel]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <Container>
      <AnimatePresence mode="wait">
        <motion.div key="sidebar" initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
          <WorkspaceSidebar />
        </motion.div>
      </AnimatePresence>
      <ChatArea>
        <MultiAgentChat />
      </ChatArea>
      <ToolPanel />
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: var(--color-background);
`

const ChatArea = styled.div`
  flex: 1;
  min-width: 0;
  overflow: hidden;
`

export default WorkspacePage
