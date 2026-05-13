# HyClaw 开发计划（v2 — 基于 Cherry Studio 二次开发）

> 最后更新：2026-05-14

## 一、项目背景

HyClaw 基于 [Cherry Studio](https://github.com/kangfenmao/cherry-studio) 二次开发，定位为 **多 Agent 协作的编程工作台**。Cherry Studio 已提供完整的 Electron 桌面端、多模型支持、MCP 工具、知识库、Agent 引擎等能力，HyClaw 在此基础上新增 **协作工作台（Workspace）** 页面。

## 二、架构定位（对应 Claude Desktop 三 Tab）

| Claude Desktop | Cherry Studio (HyClaw) | 说明 |
|---------------|----------------------|------|
| **Chat** | 助手对话页（原有） | 1v1 对话，不动 |
| **Code** | Agents 页（原有） | Claude Agent SDK 编程 Agent，不动 |
| **Cowork** | **Workspace 页（新增）** | 多 Agent 协作工作台 |

三个页面通过侧边栏图标切换，互不干扰。

## 三、Cherry Studio 已有能力（直接复用）

| 能力 | 具体实现 | 复用方式 |
|------|---------|---------|
| Markdown 渲染 | `ReactMarkdown` + `Shiki` 流式高亮 + 虚拟滚动 | workspace 消息复用 `<Markdown>` 组件 |
| Block 消息体系 | MainText/Thinking/Code/Image/Tool/File/Citation 等 | workspace 消息改用 Block 体系 |
| 流式渲染 | `useSmoothStream` 逐字渲染 + Web Worker 高亮 | workspace 直接使用 |
| Agent 引擎 | Claude Agent SDK（Bash/Edit/Read/Write 等工具） | workspace 可通过 `AgentApiClient` 调用 |
| MCP 工具 | 已有完整 MCP 服务管理 | 编程 Agent 可直接调用 |
| 知识库 | RAG + 文件管理 | workspace 对话已关联 |
| 多模型支持 | 20+ Provider，含 Anthropic 兼容端点 | workspace Agent 已复用 |
| 文档编辑器 | Notes 页面有 TipTap Block-based 编辑器 | 可嵌入 ToolPanel |
| 主题系统 | dark/light + CSS 变量 | 已适配 |
| 权限系统 | Agent 有 `default/plan/acceptEdits/bypassPermissions` 四级 | 编程 Agent 复用 |

### 关于编程 Agent 的模型支持

Cherry Studio 已为所有主流 Provider 配置了 **Anthropic 兼容端点**（`anthropicApiHost`），Claude Agent SDK 可直接使用：

| Provider | Anthropic 兼容端点 |
|----------|------------------|
| DeepSeek | `api.deepseek.com/anthropic` |
| Kimi/Moonshot | `api.moonshot.cn/anthropic` |
| GLM/智谱 | `open.bigmodel.cn/api/anthropic` |
| MiniMax | `api.minimaxi.com/anthropic` |
| 阿里通义 | `dashscope.aliyuncs.com/apps/anthropic` |
| OpenRouter | `openrouter.ai/api` |
| Ollama | `localhost:11434` |

**结论：不需要额外集成 OpenCode。** Claude Agent SDK + Anthropic 兼容端点已覆盖所有主流模型。

## 四、Workspace 页面架构

```
┌──────────────┬──────────────────────┬─────────────────┐
│  Sidebar     │    Chat Area          │   ToolPanel     │
│              │                      │                 │
│ 对话列表      │  多 Agent 消息流       │  [图标列]        │
│ Agent 池     │  (Block 渲染体系)      │  ├ 任务板        │
│              │  引用回复              │  ├ Agent 团队    │
│              │  编程 Agent 工具产出    │  ├ 文档编辑器    │
│              │                      │  ├ 知识库        │
│              │  [输入框]             │  └ ...          │
└──────────────┴──────────────────────┴─────────────────┘
```

### Agent 类型

| 类型 | 引擎 | 能力 | 模型 |
|------|------|------|------|
| **Chat Agent** | `fetchChatCompletion` | 文本对话、任务分解 | 所有模型 |
| **Code Agent** | Claude Agent SDK (`AgentApiClient`) | 文件读写、Bash、代码编辑、MCP 工具 | 所有模型（通过 Anthropic 兼容端点） |

PM Agent 默认为 Chat 类型，用户创建的 Agent 可选择类型。

## 五、开发计划

### Phase A — 核心聊天体验升级

> 目标：消息从纯文本升级到 Cherry Studio 的 Block 渲染体系

| # | 任务 | 说明 | 复用 |
|---|------|------|------|
| A1 | 消息改用 Block 体系 | workspace message 引入 `MainTextBlock`，用 `<Markdown>` 组件渲染代码高亮、表格、公式 | `MainTextBlock.tsx`、`Markdown.tsx`、`CodeBlockView` |
| A2 | 引用回复 | 消息增加 `replyTo?: string`，渲染引用源消息摘要（点击定位到原消息） | 新增，参考 Cherry Studio selection quote |
| A3 | Agent 状态提示 | 头部显示"PM 正在思考..."、"Dev 正在执行 Bash..."等文字提示 | 改进现有 UI |
| A4 | 事件消息 | 居中显示"Dev 加入了对话"、"#7 任务已完成"等系统事件 | 新增消息类型 `role: 'event'` |

**完成标准**：workspace 消息支持 Markdown 代码高亮、引用回复、Agent 状态提示

---

### Phase B — Agent 管理增强

> 目标：Agent 创建、管理、类型区分

| # | 任务 | 说明 |
|---|------|------|
| B1 | 自然语言创建 Agent | 用户用自然语言描述角色 → 调用 LLM → 生成 name/role/systemPrompt |
| B2 | Agent 克隆 | 复制角色配置为新 Agent（可修改名称和提示词） |
| B3 | Agent 暂停/恢复 | 暂停的 Agent 不参与对话调度，视觉灰化 |
| B4 | 拉入/踢出对话 | 对话级别管理 Agent 成员（从 Agent 池拉入/移出当前对话） |
| B5 | Agent 类型选择 | 创建/编辑时选择 `chat` 或 `code` 类型；code 类型需要配置工作目录 |
| B6 | Code Agent 调用 | code 类型 Agent 通过 `AgentApiClient` 调用 Claude Agent SDK，拥有 Bash/Edit/Read/Write 等工具能力 |

**完成标准**：能创建 chat 和 code 两种类型 Agent，code Agent 可在对话中执行文件操作

---

### Phase C — 任务系统增强

> 目标：任务优先级、依赖、审核流

| # | 任务 | 说明 |
|---|------|------|
| C1 | 任务优先级 | `priority: 'normal' \| 'high' \| 'urgent'`，影响队列排序 |
| C2 | 跨 Agent 依赖 | `dependsOn: string[]`，依赖满足后自动唤醒被阻塞的 Agent |
| C3 | 待审核状态 | 新增 `pending_review` 状态，PM 审核后 → 完成/驳回 |
| C4 | Agent 单线程约束 | 每个 Agent 维护自己的任务队列，一次只执行一个任务 |
| C5 | 任务卡片渲染 | 任务状态变化在聊天区生成任务卡片（"PM 将 #7 分配给 Dev"、"Dev 完成了 #7"） |

**完成标准**：PM 分配带优先级和依赖关系的任务，Agent 自动排队执行

---

### Phase D — 文件操作 & 文档工具

> 目标：Code Agent 可操作文件，文档编辑器可用

| # | 任务 | 说明 | 复用 |
|---|------|------|------|
| D1 | 对话文件沙盒 | 每个对话独立目录 `{userData}/workspace/{convId}/`，Code Agent 文件操作限制在此目录内（可配置扩展） | 新增 |
| D2 | 权限分级 | 复用 Cherry Studio Agent 的四级权限：`default`（询问）→ `plan`（只读）→ `acceptEdits`（自动编辑）→ `bypassPermissions`（全自动） | 复用 `PermissionMode` |
| D3 | Agent 工具产出渲染 | Code Agent 的 Bash/Edit/Read 等工具调用结果用 `<ToolBlock>` 渲染 | 复用 `ToolBlockGroup`、`MessageAgentTools`（BashTool、EditTool、ReadTool 等 20+ 渲染器） |
| D4 | Diff 预览卡片 | Code Agent 的文件改动显示 diff 对比 | 复用 Cherry Studio 的 EditTool 渲染 |
| D5 | TipTap 文档编辑器 | ToolPanel 嵌入 RichEditor，Agent 和用户可协作编辑文档 | 复用 Notes 的 `RichEditor` 组件 |
| D6 | 文件浏览器 | ToolPanel 新增文件浏览面板，显示对话沙盒内的文件树 | 新增，参考 Notes Sidebar |

**完成标准**：Code Agent 可在沙盒内读写文件，工具产出有可视化渲染，文档编辑器可用

---

### Phase E — 待做（标记，周边功能完善后集中优化）

| # | 任务 | 说明 | 优先级 |
|---|------|------|--------|
| E1 | 多 Agent 并行调度 | 从串行改为 `Promise.allSettled`，UI 同时显示多个 Agent 状态 | 高 |
| E2 | 浏览器嵌入 | Electron `BrowserView` 嵌入右侧面板，支持 Agent 无头抓取 + 用户有头浏览 | 中 |
| E3 | 自动化/定时任务 | 复用 Agent 系统的 `SchedulerService`，自然语言创建定时任务 | 中 |
| E4 | 视频处理 | FFmpeg sidecar，视频裁剪/拼接/字幕 | 低 |
| E5 | OpenCode 集成 | 如后续需要更灵活的多模型编程 Agent，可接入 OpenCode SDK | 低 |
| E6 | 对话导入/导出增强 | 支持导出为多种格式（当前有 Markdown/JSON） | 低 |

---

## 六、关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 编程 Agent 引擎 | **Claude Agent SDK**（已集成） | Cherry Studio 已集成，所有主流 Provider 已配置 Anthropic 兼容端点，无需额外集成 |
| 消息渲染 | **复用 Cherry Studio Block 体系** | 已有 Markdown + Shiki + 虚拟滚动 + 流式渲染，不需要从零实现 |
| 状态管理 | **Redux + redux-persist** | Cherry Studio 用 Redux，workspace slice 已接入 redux-persist 自动持久化 |
| UI 组件 | **Ant Design + styled-components + Tailwind** | 与 Cherry Studio 保持一致 |
| 文件隔离 | **对话沙盒目录**（不用 Git 分支） | 比 Git 分支更简单直观，后续有需求可加 Git |
| 权限模型 | **复用 Agent 权限四级** | `default/plan/acceptEdits/bypassPermissions`，已验证成熟 |

## 七、文件变更范围

所有新增代码限缩在以下目录，最小化与上游的冲突：

```
src/renderer/src/
├── pages/workspace/          # workspace 页面（新增）
│   ├── index.tsx
│   └── components/
│       ├── WorkspaceSidebar.tsx
│       ├── MultiAgentChat.tsx
│       ├── ToolPanel.tsx
│       └── ...
├── services/workspace/       # workspace 服务（新增）
│   ├── agentRunner.ts
│   ├── codeAgentRunner.ts    # Phase B: Code Agent 调用
│   └── taskScheduler.ts      # Phase C: 任务调度
├── store/workspace.ts        # Redux slice（新增）
└── hooks/workspace/          # 自定义 hooks（新增）
```

修改的上游文件（最小变更）：
- `Router.tsx` — 添加 `/workspace` 路由
- `Sidebar.tsx` — 添加 workspace 图标
- `types/index.ts` — 添加 `workspace` 到 SidebarIcon
- `store/index.ts` — 注册 workspace reducer
- `config/sidebar.ts` — 添加 workspace 到侧边栏
- `i18n/` — 添加 workspace 相关翻译

## 八、里程碑

```
Phase A  1-2周   核心聊天体验升级     ██░░░░░░░░░░
Phase B  2-3周   Agent 管理增强       ███░░░░░░░░░
Phase C  1-2周   任务系统增强         ██░░░░░░░░░░
Phase D  2-3周   文件操作 & 文档工具   ███░░░░░░░░░
────────────────────────────────────────
Phase A-D 约 6-10 周
Phase E   持续   待做功能池
```

## 九、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Anthropic 兼容端点 tool_use 不稳定 | Code Agent 可能失败 | 降级为 Chat Agent，提示用户切换模型 |
| Block 体系集成复杂度 | Phase A 可能延期 | 先做最小可用（MainTextBlock），后续逐步增加 |
| Claude Agent SDK 版本更新 | 可能 break 集成 | 锁版本，跟随 Cherry Studio 更新节奏 |
| 上游 Cherry Studio 合并冲突 | 功能更新时可能冲突 | 变更限缩在 workspace 目录，定期 merge upstream |
