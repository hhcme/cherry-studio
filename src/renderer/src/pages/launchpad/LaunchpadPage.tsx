import { OpenClawIcon } from '@renderer/components/Icons/SVGIcon'
import App from '@renderer/components/MinApp/MinApp'
import { useMinapps } from '@renderer/hooks/useMinapps'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import { getSidebarIconLabel } from '@renderer/i18n/label'
import {
  Code,
  FileSearch,
  Folder,
  Languages,
  LayoutGrid,
  MessageSquare,
  MousePointerClick,
  NotepadText,
  Palette,
  Sparkle,
  Workflow
} from 'lucide-react'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

const LaunchpadPage: FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { sidebarIcons, defaultPaintingProvider } = useSettings()
  const { pinned } = useMinapps()
  const { openedKeepAliveMinapps } = useRuntime()

  // 图标映射 —— 与 Sidebar.tsx 的 iconMap 保持一致
  const iconMap = useMemo(
    () => ({
      assistants: <MessageSquare size={32} className="icon" />,
      workspace: <Workflow size={32} className="icon" />,
      agents: <MousePointerClick size={32} className="icon" />,
      store: <Sparkle size={32} className="icon" />,
      paintings: <Palette size={32} className="icon" />,
      translate: <Languages size={32} className="icon" />,
      minapp: <LayoutGrid size={32} className="icon" />,
      knowledge: <FileSearch size={32} className="icon" />,
      files: <Folder size={32} className="icon" />,
      code_tools: <Code size={32} className="icon" />,
      notes: <NotepadText size={32} className="icon" />,
      openclaw: <OpenClawIcon className="icon" />
    }),
    []
  )

  // 路径映射 —— 与 Sidebar.tsx 的 pathMap 保持一致
  const pathMap = useMemo(
    () => ({
      assistants: '/',
      workspace: '/workspace',
      agents: '/agents',
      store: '/store',
      paintings: `/paintings/${defaultPaintingProvider}`,
      translate: '/translate',
      minapp: '/apps',
      knowledge: '/knowledge',
      files: '/files',
      code_tools: '/code',
      notes: '/notes',
      openclaw: '/openclaw'
    }),
    [defaultPaintingProvider]
  )

  // 背景色映射
  const bgColorMap = useMemo(
    () => ({
      assistants: 'linear-gradient(135deg, #8B5CF6, #A855F7)', // 助手：紫色
      workspace: 'linear-gradient(135deg, #3B82F6, #60A5FA)', // 工作空间：蓝色
      agents: 'linear-gradient(135deg, #F59E0B, #FBBF24)', // 智能体：橙色
      store: 'linear-gradient(135deg, #6366F1, #4F46E5)', // 商店：靛蓝
      paintings: 'linear-gradient(135deg, #EC4899, #F472B6)', // 绘画：粉色
      translate: 'linear-gradient(135deg, #06B6D4, #0EA5E9)', // 翻译：青蓝
      minapp: 'linear-gradient(135deg, #8B5CF6, #A855F7)', // 小程序：紫色
      knowledge: 'linear-gradient(135deg, #10B981, #34D399)', // 知识库：翠绿
      files: 'linear-gradient(135deg, #F59E0B, #FBBF24)', // 文件：金色
      code_tools: 'linear-gradient(135deg, #1F2937, #374151)', // 代码：暗黑
      notes: 'linear-gradient(135deg, #F97316, #FB923C)', // 笔记：橙色
      openclaw: 'linear-gradient(135deg, #EF4444, #B91C1C)' // OpenClaw：红色
    }),
    []
  )

  // 从 sidebar 配置动态生成应用菜单项
  const appMenuItems = useMemo(() => {
    return sidebarIcons.visible
      .filter((icon) => iconMap[icon])
      .map((icon) => ({
        key: icon,
        icon: iconMap[icon],
        text: getSidebarIconLabel(icon),
        path: pathMap[icon],
        bgColor: bgColorMap[icon]
      }))
  }, [sidebarIcons.visible, iconMap, pathMap, bgColorMap])

  // 合并并排序小程序列表
  const sortedMinapps = useMemo(() => {
    const result = [...pinned]

    openedKeepAliveMinapps.forEach((app) => {
      if (!result.some((pinnedApp) => pinnedApp.id === app.id)) {
        result.push(app)
      }
    })

    return result
  }, [openedKeepAliveMinapps, pinned])

  return (
    <Container>
      <Content>
        <Section>
          <SectionTitle>{t('launchpad.apps')}</SectionTitle>
          <Grid>
            {appMenuItems.map((item) => (
              <AppIcon key={item.key} onClick={() => navigate(item.path)}>
                <IconContainer>
                  <IconWrapper bgColor={item.bgColor}>{item.icon}</IconWrapper>
                </IconContainer>
                <AppName>{item.text}</AppName>
              </AppIcon>
            ))}
          </Grid>
        </Section>

        {sortedMinapps.length > 0 && (
          <Section>
            <SectionTitle>{t('launchpad.minapps')}</SectionTitle>
            <Grid>
              {sortedMinapps.map((app) => (
                <AppWrapper key={app.id}>
                  <App app={app} size={56} />
                </AppWrapper>
              ))}
            </Grid>
          </Section>
        )}
      </Content>
    </Container>
  )
}

const Container = styled.div`
  width: 100%;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background-color: var(--color-background);
  overflow-y: auto;
  padding: 50px 0;
`

const Content = styled.div`
  max-width: 720px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  opacity: 0.8;
  margin: 0;
  padding: 0 36px;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  padding: 0 8px;
`

const AppIcon = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 16px;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`

const IconContainer = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 56px;
  height: 56px;
`

const IconWrapper = styled.div<{ bgColor: string }>`
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: ${(props) => props.bgColor};
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  .icon {
    color: white;
    width: 28px;
    height: 28px;
  }
`

const AppName = styled.div`
  font-size: 12px;
  color: var(--color-text);
  text-align: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const AppWrapper = styled.div`
  padding: 8px 4px;
  border-radius: 8px;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`

export default LaunchpadPage
