import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/projects/select', { data: { name: 'example_project.yaml' } });
  const { file } = await (await request.get('/api/project')).json();
  await writeFile(file, await readFile('tests/e2e-project.yaml', 'utf8'));
  await page.route('**/api/task-defaults', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), duration_days: 3.5 } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
});

test('empty or whitespace titles show UID while the whole chart and dependency schedule remain visible', async ({ page }) => {
  const bar = page.getByTestId('bar-task-discovery');
  await bar.click();
  const name = page.getByLabel('任务名称', { exact: true });
  for (const value of ['', '   ']) {
    await name.fill(value);
    await expect(name).toHaveValue(value);
    await expect(page.locator('.task-bar')).toHaveCount(6);
    await expect(bar.locator('.bar-name')).toHaveText('task-discovery');
    await expect(page.locator('.tree-task-cell[data-task-uid="task-discovery"] .task-title strong')).toHaveText('task-discovery');
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  }
  await name.fill('恢复名称');
  await expect(bar.locator('.bar-name')).toHaveText('恢复名称');
});

test('invalid duration text stays editable, previews the configured new-task length and fills on blur', async ({ page, request }) => {
  // Explicit calendar conditions keep bar spans independent of the shared fixture.
  const data = await (await request.get('/api/project')).json();
  const task = data.project.tasks.find((task: { uid: string }) => task.uid === 'task-discovery');
  Object.assign(task, { duration_days: 1, earliest_start: { date: '2026-09-14', period: 'am' }, dependencies: [], allow_rest_day_work: true });
  data.project.project.start_date = '2026-09-14';
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  const bar = page.getByTestId('bar-task-discovery');
  await page.getByRole('button', { name: '天', exact: true }).click();
  const dayWidth = (await bar.boundingBox())!.width;
  await bar.click();
  const duration = page.getByLabel('预计耗时（天）', { exact: true });
  await expect(duration).toBeEnabled();
  for (const input of ['', '0', '-1', '0.7', '36500.5']) {
    await duration.fill(input);
    await expect(duration).toBeFocused();
    await expect(duration).toHaveValue(input);
    await expect(page.locator('.task-bar')).toHaveCount(6);
    await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(dayWidth * 3.5, 1);
    await duration.press('Tab');
    await expect(duration).toHaveValue('3.5');
  }
  await duration.fill('0.5');
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(dayWidth * 0.5, 1);
  await duration.press('Tab');
  await expect(duration).toHaveValue('0.5');
  await duration.fill('');
  await page.keyboard.press('Control+s');
  await expect(duration).toHaveValue('3.5');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const saved = await (await request.get('/api/project')).json();
  expect(saved.project.tasks.find((task: { uid: string }) => task.uid === 'task-discovery').duration_days).toBe(3.5);
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(duration).toHaveValue('3.5');
});

test('switching tasks after an invalid duration keeps the fallback and does not leak input text', async ({ page }) => {
  await page.getByTestId('bar-task-discovery').click();
  const duration = page.getByLabel('预计耗时（天）', { exact: true });
  await expect(duration).toBeEnabled();
  await duration.fill('');
  await page.getByTestId('bar-task-design').click();
  await expect(duration).toHaveValue('2');
  await page.getByTestId('bar-task-discovery').click();
  await expect(duration).toHaveValue('3.5');
  await expect(page.locator('.task-bar')).toHaveCount(6);
});
