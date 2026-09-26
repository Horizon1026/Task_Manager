import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { selectChoice } from './select';
import { GANTT_ROW_STRIDE, GANTT_SIZING } from '../src/ganttSizing';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/projects/select', { data: { name: 'example_project.yaml' } });
  const data = await (await request.get('/api/project')).json();
  await writeFile(data.file, await readFile('tests/e2e-project.yaml', 'utf8'));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
});
test('selects a YAML project file from the workspace picker', async ({ page }) => {
  const picker = page.getByLabel('选择项目文件');
  await picker.click();
  await expect(page.getByRole('option')).toHaveCount(2);
  await selectChoice(page, '选择项目文件', 'project_c5.yaml');
  await expect(page.getByRole('heading', { name: 'C5 项目' })).toBeVisible();
  await selectChoice(page, '选择项目文件', 'example_project.yaml');
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
});
async function taskDetails(page: Page, name: string) { await page.getByRole('button', { name, exact: false }).filter({ has: page.locator('strong') }).first().click(); }
test('groups navigation and project actions into two horizontal header rows', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: '工作区导航' });
  await expect(navigation).toContainText('任务排期');
  for (const name of ['项目设置', '本地日历', '备份历史']) await expect(navigation.getByRole('button', { name })).toBeVisible();
  const navigationCenters = await navigation.locator(':scope > *').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return box.top + box.height / 2; }));
  expect(Math.max(...navigationCenters) - Math.min(...navigationCenters)).toBeLessThan(2);

  const actions = page.getByRole('group', { name: '项目操作' });
  for (const name of ['新增任务', '导出交互式 HTML', '保存并备份']) await expect(actions.getByRole('button', { name, exact: false })).toBeVisible();
  const actionCenters = await actions.getByRole('button').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return box.top + box.height / 2; }));
  expect(Math.max(...actionCenters) - Math.min(...actionCenters)).toBeLessThan(2);
});
test('edits the project theme in settings and persists it to YAML', async ({ page, request }) => {
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '项目设置', exact: true }).click();
  const themeSelect = page.getByLabel('项目主题');
  await expect(themeSelect).toHaveValue('light');
  await themeSelect.selectOption('dark');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.settings-modal')).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  await expect(page.locator('.board')).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  await expect(page.getByRole('button', { name: '项目设置', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.tree-task-cell .task-title').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const taskColor = await page.getByTestId('bar-task-discovery').evaluate(node => getComputedStyle(node).backgroundColor);
  const channels = taskColor.match(/\d+/g)!.map(Number);
  expect(Math.max(...channels) - Math.min(...channels)).toBeGreaterThan(70);
  await page.getByRole('button', { name: '关闭项目设置' }).click();
  await page.getByRole('button', { name: '项目设置', exact: true }).hover();
  await expect(page.getByRole('button', { name: '项目设置', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.locator('.tree-task-cell .task-title').first().hover();
  await expect(page.locator('.tree-task-cell .task-title').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByTestId('save-state')).toContainText('未保存修改');
  await page.getByRole('button', { name: '保存并备份', exact: false }).click();
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const data = await (await request.get('/api/project')).json();
  expect(parse(await readFile(data.file, 'utf8')).project.theme).toBe('dark');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: '切换到明亮主题' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '切换到明亮主题' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.getByTestId('save-state')).toContainText('未保存修改');
});
test('loads seven scales, colors, muted filtering and read-only UID', async ({ page }) => {
  await expect(page.locator('.task-bar')).toHaveCount(6);
  await expect(page.getByTestId('bar-task-engine')).toHaveCSS('border-color', 'rgb(211, 112, 97)');
  await expect(page.getByTestId('bar-task-engine')).toHaveCSS('border-top-width', '2px');
  await expect(page.getByTestId('bar-task-engine')).toHaveCSS('animation-name', 'late-task-breathe');
  await page.getByTestId('bar-task-engine').hover();
  await expect(page.locator('.hover-card')).toContainText('半天排期引擎');
  await expect(page.locator('.hover-card')).toContainText('任务详情');
  await expect(page.locator('.hover-card')).toContainText('支持依赖计算和超期预警。');
  await expect(page.locator('.hover-card')).toContainText('已超期');
  for (const name of ['天', '周', '半月', '月', '季度', '半年', '年']) { await page.getByRole('button', { name, exact: true }).click(); await expect(page.locator('.task-bar')).toHaveCount(6); }
  await page.getByRole('button', { name: '核心', exact: true }).click();
  await expect(page.locator('.gantt-row')).toHaveCount(1); await expect(page.locator('.task-bar')).toHaveCount(1);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(6);
  await taskDetails(page, '半天排期引擎');
  await expect(page.getByLabel('任务 UID')).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('任务详情编辑')).toContainText('超过最迟完成时间');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.getByTestId('bar-task-engine').click();
  await expect(page.locator('.dependency-arrow')).toHaveCount(2);
  await expect(page.locator('.dependency-arrowhead')).toHaveCount(2);
  await expect(page.locator('.dependency-halo')).toHaveCount(0);
  await expect(page.locator('.dependency-arrowhead-halo')).toHaveCount(0);
  expect(await page.locator('.dependency-arrow').first().evaluate(node => getComputedStyle(node).filter)).not.toBe('none');
  await expect(page.locator('.dependency-layer')).toHaveCSS('z-index', '20');
});
test('dependency arrows have compact light glow and high-contrast dark strokes', async ({ page }) => {
  await page.getByTestId('bar-task-engine').click();
  const path = page.locator('.dependency-arrow').first();
  const arrow = page.locator('.dependency-arrowhead').first();
  await expect(path).toHaveCount(1);
  const lightFilter = await path.evaluate(node => getComputedStyle(node).filter);
  expect(lightFilter).toContain('0px 0px 1px');
  expect(lightFilter).toContain('0px 0px 2px');
  expect(lightFilter).not.toContain('0px 0px 5px');
  await page.getByRole('button', { name: '切换到暗色主题' }).click();
  await expect(path).toHaveCSS('stroke', 'rgb(130, 230, 255)');
  await expect(arrow).toHaveCSS('stroke', 'rgb(130, 230, 255)');
  await expect(page.locator('.dependency-layer')).toHaveCSS('color', 'rgb(130, 230, 255)');
});
test('expands the workspace and timeline to a wide browser viewport', async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1000 });
  await expect.poll(async () => (await page.locator('main').boundingBox())?.width).toBeCloseTo(2200, 0);
  const scrollWidth = await page.locator('.gantt-scroll').evaluate(node => node.clientWidth);
  const taskListWidth = await page.locator('.tree-task-labels').evaluate(node => node.getBoundingClientRect().width);
  await expect.poll(async () => (await page.locator('.time-heading').boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(scrollWidth - taskListWidth);
});
test('zooms the timeline horizontally while keeping task rows unchanged', async ({ page }) => {
  await page.getByRole('button', { name: '天', exact: true }).click();
  const bar = page.getByTestId('bar-task-engine');
  const before = (await bar.boundingBox())!;
  const rowTops = await page.locator('.tree-task-cell').evaluateAll(nodes => nodes.slice(0, 2).map(node => node.getBoundingClientRect().top));
  expect(rowTops[1] - rowTops[0]).toBe(GANTT_ROW_STRIDE);
  await expect(bar).toHaveCSS('height', `${GANTT_SIZING.barHeight}px`);
  const rowHeight = await page.locator('.tree-task-tracks').evaluate(node => node.getBoundingClientRect().height);
  await expect(page.getByRole('button', { name: '重置甘特图缩放' })).toHaveText('100%');

  await page.getByRole('button', { name: '放大甘特图' }).click();
  await page.getByRole('button', { name: '放大甘特图' }).click();
  await expect(page.getByRole('button', { name: '重置甘特图缩放' })).toHaveText('150%');
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(before.width * 1.5, 0);
  await expect.poll(async () => page.locator('.tree-task-tracks').evaluate(node => node.getBoundingClientRect().height)).toBe(rowHeight);

  await page.getByRole('button', { name: '重置甘特图缩放' }).click();
  await expect(page.getByRole('button', { name: '重置甘特图缩放' })).toHaveText('100%');
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(before.width, 0);
});
test('holding M focuses direct dependencies in read-only mode and releasing it restores the view', async ({ page }) => {
  const resize = (await page.getByRole('separator', { name: '调整任务列表宽度' }).boundingBox())!;
  await page.mouse.move(resize.x, resize.y + resize.height / 2);
  await page.mouse.down(); await page.mouse.move(resize.x + 120, resize.y + resize.height / 2, { steps: 6 }); await page.mouse.up();
  const scroll = page.locator('.gantt-scroll');
  await scroll.evaluate(node => { node.scrollLeft = 60; });
  await expect.poll(async () => scroll.evaluate(node => node.scrollLeft)).toBe(60);
  const bar = page.getByTestId('bar-task-design');
  await bar.hover();
  await page.keyboard.down('m');
  await expect(page.locator('.gantt-section')).toHaveClass(/dependency-focus-mode/);
  await expect(page.locator('.gantt-caption')).toContainText('交互与视觉设计');
  await expect(page.locator('.task-bar')).toHaveCount(3);
  await expect(page.getByTestId('bar-task-discovery')).toBeVisible();
  await expect(page.getByTestId('bar-task-design')).toBeVisible();
  await expect(page.getByTestId('bar-task-gantt')).toBeVisible();
  await expect(page.getByTestId('bar-task-engine')).toHaveCount(0);
  await expect(page.locator('.dependency-arrow')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '新增任务', exact: false })).toBeDisabled();

  const focused = (await page.getByTestId('bar-task-design').boundingBox())!;
  await page.mouse.move(focused.x + focused.width / 2, focused.y + 15);
  await page.mouse.down(); await page.mouse.move(focused.x + focused.width / 2 - 100, focused.y + 15, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => scroll.evaluate(node => node.scrollLeft)).toBeGreaterThan(60);
  await expect(page.getByLabel('任务详情编辑')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');

  await page.keyboard.up('m');
  await expect(page.locator('.gantt-section')).not.toHaveClass(/dependency-focus-mode/);
  await expect.poll(async () => scroll.evaluate(node => node.scrollLeft)).toBe(60);
  await expect(page.locator('.task-bar')).toHaveCount(6);
  await expect(page.locator('.dependency-arrow')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新增任务', exact: false })).toBeEnabled();

  await page.getByTestId('bar-task-design').click();
  await expect(page.getByLabel('任务详情编辑')).toBeVisible();
  await page.getByTestId('bar-task-design').hover();
  await page.keyboard.down('m');
  await expect(page.locator('.gantt-section')).not.toHaveClass(/dependency-focus-mode/);
  await page.keyboard.up('m');
});
test('freezes and resizes the left task list', async ({ page }) => {
  const taskList = page.locator('.tree-task-labels');
  const before = (await taskList.boundingBox())!;
  await page.locator('.gantt-scroll').evaluate(node => { node.scrollLeft = 160; });
  await expect.poll(async () => (await taskList.evaluate(node => node.getBoundingClientRect().x))).toBeCloseTo(before.x, 0);
  await expect(taskList).toHaveCSS('z-index', '30');

  const handle = page.getByRole('separator', { name: '调整任务列表宽度' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.task-heading')).toHaveCSS('width', '340px');
  await expect(taskList).toHaveCSS('width', '340px');
});
test('drags a task tree node to reorder same-level siblings', async ({ page }) => {
  const rows = page.locator('.tree-task-cell');
  await rows.filter({ hasText: '交互与视觉设计' }).locator('.row-grip').dragTo(rows.filter({ hasText: '需求梳理' }));
  await expect.poll(async () => rows.evaluateAll(nodes => nodes.map(node => node.querySelector('strong')?.textContent))).toEqual([
    '交互与视觉设计', '需求梳理', '半天排期引擎', '甘特图与任务编辑', '联合功能测试', '第一版交付',
  ]);
});
test('blank Gantt canvas closes task details and supports horizontal panning', async ({ page }) => {
  await page.getByTestId('bar-task-discovery').click();
  await expect(page.getByLabel('任务详情编辑')).toBeVisible();
  const handle = page.getByRole('separator', { name: '调整任务列表宽度' });
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x, handleBox.y + handleBox.height / 2);
  await page.mouse.down(); await page.mouse.move(handleBox.x + 120, handleBox.y + handleBox.height / 2, { steps: 6 }); await page.mouse.up();
  const body = page.locator('.gantt-body');
  const blank = await body.evaluate(node => {
    const rect = node.getBoundingClientRect();
    for (let y = rect.top + 6; y < rect.bottom - 6; y += 8) for (let x = rect.left + 320; x < rect.right - 20; x += 32) {
      const target = document.elementFromPoint(x, y) as HTMLElement | null;
      if (target && !target.closest('[data-task-uid], .tree-task-labels, .hover-card, .editor')) return { x, y };
    }
    return null;
  });
  expect(blank).not.toBeNull();
  await page.mouse.click(blank!.x, blank!.y);
  await expect(page.getByLabel('任务详情编辑')).toHaveCount(0);

  const scroll = page.locator('.gantt-scroll');
  await expect(scroll).toHaveCSS('overflow-y', 'hidden');
  expect(await scroll.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await page.mouse.move(blank!.x, blank!.y);
  await page.mouse.down(); await page.mouse.move(blank!.x - 120, blank!.y, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => scroll.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
});
test('task details header can create another task without discarding the current draft', async ({ page }) => {
  await taskDetails(page, '需求梳理');
  const oldUid = await page.getByLabel('任务 UID').inputValue();
  await page.getByLabel('任务名称', { exact: true }).fill('尚未保存的名称');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(7);
  await expect(page.getByLabel('任务名称', { exact: true })).toHaveValue('新任务');
  await expect(page.getByLabel('预计耗时（天）')).toHaveValue('2');
  await expect(page.getByLabel('排序 ID')).toHaveValue('7');
  await expect(page.getByLabel('任务 UID')).not.toHaveValue(oldUid);
  await expect(page.getByTestId('save-state')).toContainText('未保存');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await taskDetails(page, '尚未保存的名称');
  await expect(page.getByLabel('任务 UID')).toHaveValue(oldUid);
});
test('edits are drafts; Ctrl+S saves edited content and matching backup', async ({ page, request }) => {
  await taskDetails(page, '需求梳理'); await page.getByLabel('任务名称', { exact: true }).fill('浏览器测试任务');
  await expect(page.getByTestId('save-state')).toContainText('未保存');
  let data = await (await request.get('/api/project')).json(); expect(data.project.tasks[0].name).toBe('需求梳理');
  await page.keyboard.press('Control+s'); await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  data = await (await request.get('/api/project')).json(); expect(data.project.tasks[0].name).toBe('浏览器测试任务');
  const { backups } = await (await request.get('/api/backups')).json(); expect(backups.some((n: string) => n.includes('_saved_'))).toBe(true);
});
test('external YAML refreshes clean view and warns without discarding dirty draft', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json(); data.project.project.name = '外部项目名称';
  await writeFile(data.file, stringify(data.project)); await expect(page.getByRole('heading', { name: '外部项目名称' })).toBeVisible();
  await taskDetails(page, '需求梳理'); await page.getByLabel('任务名称', { exact: true }).fill('本地草稿');
  data.project.project.name = '另一外部名称'; await writeFile(data.file, stringify(data.project));
  await expect(page.getByRole('alert')).toContainText('外部 YAML 已变化');
  await expect(page.getByLabel('任务名称', { exact: true })).toHaveValue('本地草稿');
  await expect(page.getByRole('button', { name: '保存并备份', exact: false })).toBeDisabled();
});
test('calendar local override recalculates preview and persists with project', async ({ page, request }) => {
  await page.getByRole('button', { name: '本地日历', exact: true }).click();
  await page.getByRole('button', { name: '2026-09-14 工作日', exact: true }).click();
  await selectChoice(page, '修正日期类型', 'rest'); await page.getByLabel('日历修正备注').fill('团队休息');
  await page.getByRole('button', { name: '应用本地修正' }).click(); await page.getByRole('button', { name: '关闭日历', exact: true }).click();
  await taskDetails(page, '需求梳理'); await expect(page.locator('.computed')).toContainText('2026-09-15 上午');
  await page.getByRole('button', { name: '保存并备份', exact: false }).click(); await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const data = await (await request.get('/api/project')).json(); expect(data.project.calendar.overrides[0].note).toBe('团队休息');
});
test('task CRUD and reorder preserve UID references', async ({ page, request }) => {
  await page.getByRole('button', { name: '新增任务', exact: false }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('新增验证'); await selectChoice(page, '执行人', '测试员');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.getByRole('button', { name: '上移 新增验证', exact: true }).click({ force: true });
  await page.getByRole('button', { name: '保存并备份', exact: false }).click(); await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const data = await (await request.get('/api/project')).json(); expect(data.project.tasks[5].name).toBe('新增验证'); expect(data.project.tasks[6].dependencies).toEqual(['task-qa']);
  await taskDetails(page, '新增验证'); page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '删除任务', exact: true }).click(); await expect(page.locator('.gantt-row')).toHaveCount(6);
});
test('parent selection creates a container, prevents descendant cycles, and persists the tree', async ({ page, request }) => {
  await page.getByRole('button', { name: '新增任务', exact: false }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('父级验证任务');
  const parentUid = await page.getByLabel('任务 UID').inputValue();
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.getByRole('button', { name: '新增任务', exact: false }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('子级验证任务');
  await selectChoice(page, '父任务', parentUid);
  await expect(page.getByRole('status')).toContainText('父任务已更新');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await taskDetails(page, '父级验证任务');
  await expect(page.getByLabel('预计耗时（天）')).toBeDisabled();
  await expect(page.getByRole('button', { name: '删除任务', exact: true })).toBeDisabled();
  await page.getByLabel('父任务', { exact: true }).fill('子级验证任务');
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  const parentBar = (await page.getByRole('button', { name: '任务条 父级验证任务' }).boundingBox())!;
  const childBar = (await page.getByRole('button', { name: '任务条 子级验证任务' }).boundingBox())!;
  const parentLabel = (await page.locator('.gantt-row').filter({ hasText: '父级验证任务' }).boundingBox())!;
  const childLabel = (await page.locator('.gantt-row').filter({ hasText: '子级验证任务' }).boundingBox())!;
  expect(parentBar.height).toBeGreaterThan(childBar.height);
  expect(parentLabel.height).toBe(childLabel.height);
  expect(parentLabel.y).toBe(parentBar.y);
  expect(childLabel.y).toBe(childBar.y);
  expect(childLabel.y).toBeGreaterThanOrEqual(parentLabel.y + parentLabel.height);
  expect(childBar.y).toBeGreaterThan(parentBar.y);
  expect(childBar.y + childBar.height).toBeLessThan(parentBar.y + parentBar.height);
  await expect(page.getByRole('button', { name: '任务条 父级验证任务' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByRole('button', { name: '任务条 父级验证任务' })).toHaveCSS('align-items', 'flex-start');
  const resizeHandle = page.getByRole('separator', { name: '调整任务列表宽度' });
  const resizeBox = (await resizeHandle.boundingBox())!;
  await page.mouse.move(resizeBox.x, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down(); await page.mouse.move(resizeBox.x + 120, resizeBox.y + resizeBox.height / 2, { steps: 6 }); await page.mouse.up();
  const parentBarForPan = page.getByRole('button', { name: '任务条 父级验证任务' });
  await parentBarForPan.scrollIntoViewIfNeeded();
  const panBox = (await parentBarForPan.boundingBox())!;
  const parentFrameY = panBox.y + 3;
  await page.mouse.move(panBox.x + panBox.width / 2, parentFrameY);
  await page.mouse.down(); await page.mouse.move(panBox.x - 90, parentFrameY, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => page.locator('.gantt-scroll').evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await expect(page.getByLabel('任务详情编辑')).toHaveCount(0);
  await page.getByRole('button', { name: '保存并备份', exact: false }).click();
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const data = await (await request.get('/api/project')).json();
  const parent = data.project.tasks.find((task: { name: string }) => task.name === '父级验证任务');
  const child = data.project.tasks.find((task: { name: string }) => task.name === '子级验证任务');
  expect(child.parent_uid).toBe(parent.uid);
});
test('dependency dropdown prevents cycles and allows removing an edge', async ({ page }) => {
  await taskDetails(page, '需求梳理'); await selectChoice(page, '选择前置任务', 'task-qa'); await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('循环依赖');
  await page.getByRole('button', { name: '关闭任务详情' }).click(); await taskDetails(page, '交互与视觉设计');
  await page.getByRole('button', { name: '移除依赖 task-discovery' }).click(); await expect(page.locator('.computed')).toContainText('2026-09-14 上午');
});
test('mouse drag moves by half-day, right handle changes duration, and blocked dependency drag changes nothing', async ({ page, request }) => {
  const dataBefore = await (await request.get('/api/project')).json();
  const initialDuration = dataBefore.project.tasks.find((task: { uid: string }) => task.uid === 'task-discovery').duration_days;
  await page.getByRole('button', { name: '天', exact: true }).click();
  const bar = page.getByTestId('bar-task-discovery'); let box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 16); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 36, box.y + 16, { steps: 8 }); await page.mouse.up();
  await taskDetails(page, '需求梳理'); await expect(page.getByLabel('最早可开始时间', { exact: true })).toHaveValue('2026-09-14'); await expect(page.getByLabel('最早可开始时间时段')).toHaveValue('下午');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  box = (await bar.boundingBox())!; await page.mouse.move(box.x + box.width - 3, box.y + 16); await page.mouse.down(); await page.mouse.move(box.x + box.width + 33, box.y + 16, { steps: 8 }); await page.mouse.up();
  await taskDetails(page, '需求梳理'); await expect(page.getByLabel('预计耗时（天）')).toHaveValue(String(initialDuration + 0.5)); await page.getByRole('button', { name: '关闭任务详情' }).click();
  const child = (await page.getByTestId('bar-task-design').boundingBox())!;
  await page.mouse.move(child.x + 20, child.y + 16); await page.mouse.down(); await page.mouse.move(child.x - 80, child.y + 16, { steps: 8 }); await page.mouse.up();
  await expect(page.getByRole('status')).toContainText('已阻止拖动');
  await page.getByRole('button', { name: '保存并备份', exact: false }).click(); await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const data = await (await request.get('/api/project')).json(); expect(data.project.tasks[1].earliest_start).toBeNull();
});
test('right-button arrow adds dependency, then backup can restore earlier content', async ({ page, request }) => {
  const prerequisite = (await page.getByTestId('bar-task-design').boundingBox())!, dependent = (await page.getByTestId('bar-task-engine').boundingBox())!;
  await page.mouse.move(dependent.x + dependent.width / 2, dependent.y + 16); await page.mouse.down({ button: 'right' });
  await page.mouse.move(prerequisite.x + prerequisite.width / 2, prerequisite.y + 16, { steps: 10 });
  const endpoints = await page.locator('.drag-arrow > path').evaluate(path => {
    const value = path as SVGPathElement, length = value.getTotalLength();
    const start = value.getPointAtLength(0), end = value.getPointAtLength(length);
    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
  });
  expect(endpoints.start.x).toBeCloseTo(prerequisite.x + prerequisite.width / 2, 0);
  expect(endpoints.start.y).toBeCloseTo(prerequisite.y + 16, 0);
  expect(endpoints.end.x).toBeCloseTo(dependent.x + dependent.width / 2, 0);
  expect(endpoints.end.y).toBeCloseTo(dependent.y + 16, 0);
  await page.mouse.up({ button: 'right' });
  await expect(page.getByRole('status')).toContainText('依赖已添加');
  await page.getByRole('button', { name: '保存并备份', exact: false }).click(); await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const data = await (await request.get('/api/project')).json(); expect(data.project.tasks[2].dependencies).toContain('task-design');
  const first = (await (await request.get('/api/backups')).json()).backups.find((n: string) => n.includes('_initial_'));
  await page.getByRole('button', { name: '备份历史', exact: true }).click(); page.once('dialog', d => d.accept());
  await page.locator('.backup-list > div').filter({ hasText: first }).getByRole('button', { name: '恢复' }).click();
  await expect(page.getByRole('status')).toContainText('已恢复备份');
});
test('invalid external YAML retains last valid view and recovers after repair', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json(); const content = await readFile(data.file, 'utf8');
  await writeFile(data.file, 'tasks: ['); await expect(page.getByRole('alert')).toContainText('磁盘文件读取失败'); await expect(page.locator('.gantt-row')).toHaveCount(6);
  await writeFile(data.file, content); await expect(page.getByRole('alert')).toHaveCount(0);
});
test('local server rejects cross-origin writes', async ({ request }) => {
  const response = await request.post('/api/save', { headers: { origin: 'https://unrelated.example' }, data: {} }); expect(response.status()).toBe(403);
});

test('project settings configure start date, assignees and assignee serialization', async ({ page, request }) => {
  await page.getByRole('button', { name: '项目设置', exact: true }).click();
  await page.getByLabel('项目开始日期').fill('2026-09-15');
  const parallelTasks = page.getByLabel('允许同一个执行人同时有并行任务');
  await expect(parallelTasks).toBeChecked();
  await parallelTasks.uncheck();
  await expect(parallelTasks).not.toBeChecked();
  await page.getByLabel('新增执行人').fill('新成员');
  await page.getByRole('button', { name: '添加执行人' }).click();
  await expect(page.getByRole('button', { name: '删除执行人 新成员' })).toBeVisible();
  await page.getByRole('button', { name: '删除执行人 新成员' }).click();
  await expect(page.getByRole('button', { name: '删除执行人 新成员' })).toHaveCount(0);
  await page.getByLabel('新增执行人').fill('新成员');
  await page.getByRole('button', { name: '添加执行人' }).click();
  await page.getByRole('button', { name: '删除执行人 小林' }).click();
  await expect(page.getByRole('status')).toContainText('仍由其负责');
  await page.getByRole('button', { name: '完成编辑' }).click();

  await page.getByTestId('bar-task-release').click();
  await expect(page.locator('.dependency-arrow.assignee-dependency')).toHaveCount(1);
  await expect(page.getByLabel('任务详情编辑')).toContainText('同执行人自动串行');
  await expect(page.getByRole('button', { name: '移除依赖 task-engine' })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.getByRole('button', { name: '保存并备份', exact: false }).click();
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const { project: saved } = await (await request.get('/api/project')).json();
  expect(saved.project.start_date).toBe('2026-09-15');
  expect(saved.project.allow_assignee_parallel_tasks).toBe(false);
  expect(saved.project.assignees).toContain('新成员');
  expect(saved.tasks.find((task: { uid: string }) => task.uid === 'task-release').dependencies).toEqual(['task-qa']);
});


test('today marker tracks the local minute without reloading', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 16, 12, 34, 0) });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
  await page.getByRole('button', { name: '天', exact: true }).click();
  const marker = page.locator('.today-line');
  const before = Number.parseFloat((await marker.getAttribute('style'))!.match(/left:\s*([\d.-]+)px/)![1]);
  await page.clock.runFor(60_100);
  await expect.poll(async () => Number.parseFloat((await marker.getAttribute('style'))!.match(/left:\s*([\d.-]+)px/)![1]))
    .toBeCloseTo(before + 72 / 1440, 3);
});
