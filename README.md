# TaskManager

本地运行的 YAML 任务管理器，提供半天粒度排期、甘特图、任务依赖、项目日历、明暗主题和离线 HTML 导出。

## 启动

在本项目目录运行：

```bash
bash run.sh
```

Windows 可运行 `run.cmd`；启动脚本会在首次运行时准备依赖。已有 Node.js 的环境也可使用 `npm install` 和 `npm run dev`。浏览器访问 <http://127.0.0.1:4310>。

默认打开 `data/example_project.yaml`。将其他 YAML 文件放在同一目录，即可从页面顶部切换；也可通过 `TASK_MANAGER_FILE=/path/to/project.yaml` 指定启动文件。

## 基本使用

- 在“项目设置”中修改项目名称、执行人、主题和同执行人排期策略。主题也可在 YAML 的 `project.theme` 中设为 `light` 或 `dark`。
- 点击任务编辑详情；拖动任务条调整开始时间，拖动右边缘调整耗时。右键拖动添加依赖；按住 `R` 再右键拖动设置父任务。按住 `M` 可聚焦查看任务的直接依赖；“今天”竖线每分钟自动更新。
- 修改先留在页面草稿中。点击“保存并备份”或按 `Ctrl+S` 才会写入 YAML；可从“备份历史”恢复。若磁盘文件被外部修改，页面会提示冲突。
- “本地日历”可加载年度放假安排并手动修正工作日。未加载的年份按普通周末暂估。
- “导出交互式 HTML”会下载可独立打开的只读文件，包含当前草稿、任务详情及甘特图交互，不会修改 YAML。

项目配置示例（完整格式见 `data/example_project.yaml`）：

```yaml
project:
  theme: dark
  allow_assignee_parallel_tasks: false
  assignees: [小林, 小陈]
```

新任务默认值在 `task_defaults.yaml` 中设置；任务状态色由 `src/theme.ts` 决定，甘特图行高和间距由 `src/ganttSizing.ts` 决定。

## 开发与验证

```bash
npm run dev        # 开发服务器
npm test           # 单元测试
npm run build      # 生产构建
npm run test:e2e   # 浏览器测试
```

离线查看器源码是 `src/interactiveViewer.ts` 和 `src/interactiveViewer.css`；构建时自动生成内联资源，无需编辑 `src/interactiveViewer.generated.ts`。浏览器测试使用临时 YAML，不会修改示例项目。
