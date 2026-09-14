import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';

test.beforeEach(async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json();
  await writeFile(data.file, await readFile('tests/e2e-project.yaml', 'utf8'));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'MissionManager 示例项目' })).toBeVisible();
});
async function taskDetails(page: Page, name: string) { await page.getByRole('button', { name, exact: false }).filter({ has: page.locator('strong') }).first().click(); }
test('loads seven scales, colors, muted filtering and read-only UID', async ({ page }) => {
  await expect(page.locator('.task-bar')).toHaveCount(6);
  await page.getByTestId('bar-task-engine').hover();
  await expect(page.locator('.hover-card')).toContainText('半天排期引擎');
  for (const name of ['天', '周', '半月', '月', '季度', '半年', '年']) { await page.getByRole('button', { name, exact: true }).click(); await expect(page.locator('.task-bar')).toHaveCount(6); }
  await page.getByRole('button', { name: '核心', exact: true }).click();
  await expect(page.locator('.gantt-row')).toHaveCount(6); await expect(page.locator('.gantt-row.muted-row')).toHaveCount(5);
  await taskDetails(page, '半天排期引擎');
  await expect(page.getByLabel('任务 UID')).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('任务详情编辑')).toContainText('超过最迟完成时间');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.getByTestId('bar-task-engine').click();
  await expect(page.locator('.dependency-arrow')).toHaveCount(2);
  await expect(page.locator('.dependency-arrowhead')).toHaveCount(2);
  await expect(page.locator('.dependency-layer')).toHaveCSS('z-index', '20');
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
  await page.getByLabel('修正日期类型').selectOption('rest'); await page.getByLabel('日历修正备注').fill('团队休息');
  await page.getByRole('button', { name: '应用本地修正' }).click(); await page.getByRole('button', { name: '关闭日历', exact: true }).click();
  await taskDetails(page, '需求梳理'); await expect(page.locator('.computed')).toContainText('2026-09-15 上午');
  await page.getByRole('button', { name: '保存并备份', exact: false }).click(); await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const data = await (await request.get('/api/project')).json(); expect(data.project.calendar.overrides[0].note).toBe('团队休息');
});
test('task CRUD and reorder preserve UID references', async ({ page, request }) => {
  await page.getByRole('button', { name: '新增任务', exact: false }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('新增验证'); await page.getByLabel('执行人', { exact: true }).fill('测试员');
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
  await page.getByLabel('父任务').selectOption(parentUid);
  await expect(page.getByRole('status')).toContainText('父任务已更新');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await taskDetails(page, '父级验证任务');
  await expect(page.getByLabel('预计耗时（天）')).toBeDisabled();
  await expect(page.getByRole('button', { name: '删除任务', exact: true })).toBeDisabled();
  await expect(page.getByLabel('父任务')).not.toContainText('子级验证任务');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  const parentBar = (await page.getByRole('button', { name: '任务条 父级验证任务' }).boundingBox())!;
  const childBar = (await page.getByRole('button', { name: '任务条 子级验证任务' }).boundingBox())!;
  const parentLabel = (await page.locator('.gantt-row').filter({ hasText: '父级验证任务' }).boundingBox())!;
  const childLabel = (await page.locator('.gantt-row').filter({ hasText: '子级验证任务' }).boundingBox())!;
  expect(parentBar.height).toBeGreaterThan(childBar.height);
  expect(parentLabel.height).toBe(childLabel.height);
  expect(childLabel.y).toBeGreaterThanOrEqual(parentLabel.y + parentLabel.height);
  expect(childBar.y).toBeGreaterThan(parentBar.y);
  expect(childBar.y + childBar.height).toBeLessThan(parentBar.y + parentBar.height);
  await expect(page.getByRole('button', { name: '任务条 父级验证任务' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByRole('button', { name: '任务条 父级验证任务' })).toHaveCSS('align-items', 'flex-start');
  await page.getByRole('button', { name: '保存并备份', exact: false }).click();
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const data = await (await request.get('/api/project')).json();
  const parent = data.project.tasks.find((task: { name: string }) => task.name === '父级验证任务');
  const child = data.project.tasks.find((task: { name: string }) => task.name === '子级验证任务');
  expect(child.parent_uid).toBe(parent.uid);
});
test('dependency dropdown prevents cycles and allows removing an edge', async ({ page }) => {
  await taskDetails(page, '需求梳理'); await page.getByLabel('选择前置任务').selectOption('task-qa'); await page.getByRole('button', { name: '添加', exact: true }).click();
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
  await taskDetails(page, '需求梳理'); await expect(page.getByLabel('最早可开始时间', { exact: true })).toHaveValue('2026-09-14'); await expect(page.getByLabel('最早可开始时间时段')).toHaveValue('pm');
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
  const a = (await page.getByTestId('bar-task-design').boundingBox())!, b = (await page.getByTestId('bar-task-engine').boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + 16); await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x + b.width / 2, b.y + 16, { steps: 10 }); await expect(page.locator('.drag-arrow')).toBeVisible(); await page.mouse.up({ button: 'right' });
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
