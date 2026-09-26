import { scales, scaleNames, type Project, type Scale } from './model';
import { scheduleProjectPlan } from './schedule';
import { statusColorsByTheme } from './theme';
import { VIEWER_CSS, VIEWER_SCRIPT } from './interactiveViewer.generated';

export type InteractiveExportOptions = {
  scale: Scale;
  filter: Project['project']['default_filter'];
  draft?: boolean;
  exportedAt?: Date;
};

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
  }[character] ?? character));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

export function interactiveExportFilename(projectName: string, date = new Date()) {
  const safe = projectName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').slice(0, 80) || 'TaskManager';
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${safe}_甘特图_${localDate}.html`;
}

export function createInteractiveGanttHtml(project: Project, options: InteractiveExportOptions) {
  const exportedAt = options.exportedAt ?? new Date();
  const plan = scheduleProjectPlan(project);
  const schedule = plan.schedule;
  const dependencies = plan.dependencyEdges;
  const payload = {
    project,
    statusColors: statusColorsByTheme[project.project.theme],
    schedules: [...schedule].map(([uid, value]) => ({ uid, ...value })),
    dependencies,
    view: { scale: options.scale, filter: options.filter },
    labels: [...new Set(project.tasks.flatMap(task => task.labels))].sort(),
    draft: !!options.draft,
    exportedAt: exportedAt.toISOString(),
  };
  const scaleButtons = scales.map((scale, index) => `<button type="button" data-scale="${scale}">${scaleNames[index]}</button>`).join('');
  const title = escapeHtml(project.project.name);
  return `<!doctype html>
<html lang="zh-CN" data-theme="${project.project.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<title>${title} · 交互式甘特图</title><style>${VIEWER_CSS}</style></head><body>
<header><div class="brand"><span class="logo">T</span><div><h1>${title}</h1><p>TaskManager 交互式甘特图 · 只读快照</p></div></div><div class="header-meta">导出于 ${escapeHtml(exportedAt.toLocaleString('zh-CN'))}<br><span id="draft" class="warning">包含未保存草稿</span></div></header>
<main><div class="toolbar"><input id="search" type="search" placeholder="搜索名称、UID、执行人…" aria-label="搜索任务"><select id="labels-filter" aria-label="标签筛选"></select><select id="mode" aria-label="标签匹配模式"><option value="or">任一标签</option><option value="and">全部标签</option></select>${scaleButtons}<span class="spacer"></span><button id="zoom-out" type="button">缩小</button><button id="zoom-in" type="button">放大</button><button id="reset" type="button">重置视图</button></div>
<section class="shell"><div class="caption"><span id="range"></span><span>悬浮仅高亮依赖 · 单击叶子任务聚焦 · 点击任意非叶子任务区域恢复</span><span id="count"></span></div><div id="scroll" class="scroll"><div id="canvas" class="canvas"><div class="head"><div id="labels-head" class="labels-head">任务 / 执行人</div><div id="axis" class="axis"></div></div><div id="body" class="body"><div id="grid" class="grid"></div><div id="labels" class="labels"></div><div id="bars" class="bars"></div><svg id="edges" class="edges"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke-width="1.5"></path></marker></defs><g id="edge-paths"></g></svg></div></div></div><div class="footer">该文件是离线只读快照，不会连接 TaskManager 服务或修改 YAML。</div></section></main>
<aside id="details" class="details" hidden></aside><script id="task-manager-data" type="application/json">${safeJson(payload)}</script><script>${VIEWER_SCRIPT}</script></body></html>`;
}

export function downloadInteractiveGanttHtml(project: Project, options: InteractiveExportOptions) {
  const html = createInteractiveGanttHtml(project, options);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = interactiveExportFilename(project.project.name, options.exportedAt);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
