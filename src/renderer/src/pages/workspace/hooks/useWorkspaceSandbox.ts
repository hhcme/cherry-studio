import { loggerService } from '@logger'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setConversationWorkDir } from '@renderer/store/workspace'
import { useCallback } from 'react'

const logger = loggerService.withContext('useWorkspaceSandbox')

let cachedBasePath: string | null = null

export function useWorkspaceSandbox() {
  const dispatch = useAppDispatch()
  const { activeConversationId, conversations } = useAppSelector((s) => s.workspace)
  const activeConv = conversations.find((c) => c.id === activeConversationId)

  const ensureWorkDir = useCallback(async () => {
    if (!activeConversationId) return null

    if (activeConv?.workDir) {
      try {
        await window.api.file.mkdir(activeConv.workDir)
      } catch {}
      return activeConv.workDir
    }

    try {
      if (!cachedBasePath) {
        const appInfo = await window.api.getAppInfo()
        const notesPath: string = appInfo.notesPath || ''
        const dataDir = notesPath.replace(/\/Notes$/, '').replace(/\\Notes$/, '')
        cachedBasePath = `${dataDir}/workspace`
      }

      const workDir = `${cachedBasePath}/${activeConversationId}`
      await window.api.file.mkdir(cachedBasePath)
      await window.api.file.mkdir(workDir)

      dispatch(setConversationWorkDir({ conversationId: activeConversationId, workDir }))
      return workDir
    } catch (err) {
      logger.error('Failed to create work dir:', err as Error)
      return null
    }
  }, [activeConversationId, activeConv?.workDir, dispatch])

  return { ensureWorkDir, getWorkDir: () => activeConv?.workDir || null, workDir: activeConv?.workDir || null }
}
