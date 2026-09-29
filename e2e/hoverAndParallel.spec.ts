import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { pathToFileURL } from 'node:url';
import { selectChoice } from './select';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/projects/select', { data: { name: 'example_project.yaml' } });
  const { file } = await (await request.get('/api/project')).json();
  await writeFile(file, await readFile('tests/e2e-project.yaml', 'utf8'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
});

test('hover remains available during M focus and above the left list with a fully readable long description', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json();
  const description = ('完整详情需要保留换行和全部文字。\n').repeat(100) + '详情末尾标记';
  data.project.tasks[1].description = description;
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  await page.getByTestId('bar-task-design').hover();
  await page.keyboard.down('m');
  await page.mouse.move(5, 5);
  await page.getByTestId('bar-task-discovery').hover();
  await expect(page.locator('.hover-card')).toContainText('需求梳理');
  await page.keyboard.up('m');
  await page.mouse.move(5, 5);
  await page.locator('.tree-task-cell[data-task-uid="task-design"]').hover({ position: { x: 10, y: 10 } });
  const popup = page.locator('.hover-card');
  await expect(popup.locator('.task-preview-description')).toHaveText(description);
  expect(await popup.evaluate(el => {
    const box = el.getBoundingClientRect();
    return el.parentElement === document.body && el.contains(document.elementFromPoint(box.x + 5, box.y + 5));
  })).toBe(true);
  await popup.hover();
  await popup.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await popup.evaluate(el => el.scrollTop > 0)).toBe(true);
  await expect(popup).toBeVisible();
});

test('assignee and label filters combine and persist as the default view', async ({ page }) => {
  await page.getByRole('group', { name: '执行人筛选', exact: true }).getByRole('button', { name: '小林', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(3);
  await page.getByRole('button', { name: '开发', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(1);
  await expect(page.getByTestId('bar-task-engine')).toBeVisible();
  await page.getByRole('button', { name: '设为默认视图' }).click();
  await page.getByRole('button', { name: /保存并备份/ }).click();
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  await page.reload();
  await expect(page.getByRole('group', { name: '执行人筛选', exact: true }).getByRole('button', { name: '小林', exact: true })).toHaveClass(/selected/);
  await expect(page.locator('.task-bar')).toHaveCount(1);
});

test('all same-assignee parallel tasks glow, including filtered conflicts and simultaneous lateness', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json();
  data.project.tasks[1].assignee = '小林';
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  await expect(page.locator('.parallel-task')).toHaveCount(2);
  await expect(page.getByTestId('bar-task-design')).toHaveCSS('animation-name', 'parallel-task-breathe');
  await expect(page.getByTestId('bar-task-engine')).toHaveClass(/late.*parallel-task/);
  await expect(page.getByTestId('bar-task-engine')).toHaveCSS('animation-name', 'parallel-late-task-breathe');
  await page.getByRole('button', { name: '设计', exact: true }).click();
  await expect(page.locator('.parallel-task')).toHaveCount(1);
});

test('offline popup follows hover before and after selecting a task without replacing the pinned details', async ({ page }, testInfo) => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出交互式 HTML' }).click();
  const output = testInfo.outputPath('hover.html');
  await (await pending).saveAs(output);
  await page.goto(pathToFileURL(output).href);
  await page.locator('.bar[data-uid="task-design"]').hover();
  await expect(page.locator('#hover-preview')).toContainText('交互与视觉设计');
  await expect(page.locator('#details')).toBeHidden();
  await page.locator('.bar[data-uid="task-design"]').click();
  await page.mouse.move(5, 5);
  await page.locator('.bar[data-uid="task-discovery"]').hover();
  await expect(page.locator('#hover-preview')).toContainText('确认任务字段和半天排期规则。');
  await expect(page.locator('#details h2')).toHaveText('交互与视觉设计');
  await expect(page.locator('.bar')).toHaveCount(3);
});


test('filter rows put mode first, support assignee multi-selection, and intersect both groups', async ({ page }) => {
  const labels = page.getByRole('group', { name: '标签筛选', exact: true });
  const assignees = page.getByRole('group', { name: '执行人筛选', exact: true });
  for (const row of [labels, assignees]) {
    expect(await row.evaluate(el => !!el.firstElementChild?.querySelector('[role="combobox"]'))).toBe(true);
    const rowBox = (await row.boundingBox())!;
    const modeBox = (await row.getByRole('combobox').boundingBox())!;
    expect(modeBox.x - rowBox.x).toBeLessThan(30);
  }
  await assignees.getByRole('button', { name: '小林', exact: true }).click();
  await assignees.getByRole('button', { name: '小陈', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(5);
  await labels.getByRole('button', { name: '开发', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(2);
  await selectChoice(page, '执行人匹配模式', 'and');
  await expect(page.locator('.task-bar')).toHaveCount(0);
  await assignees.getByRole('button', { name: '小陈', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(1);
  await page.getByRole('button', { name: '设为默认视图' }).click();
  await page.getByRole('button', { name: /保存并备份/ }).click();
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  await page.reload();
  await expect(page.getByRole('combobox', { name: '执行人匹配模式', exact: true })).toHaveValue('全部匹配 AND');
  await expect(page.locator('.task-bar')).toHaveCount(1);
  await assignees.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(2);
  await labels.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page.locator('.task-bar')).toHaveCount(6);
});
