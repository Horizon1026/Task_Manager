import { test, expect, type Locator } from '@playwright/test';
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

async function growAndShrink(popup: Locator) {
  const content = popup.locator('.hover-card-content');
  await expect(popup).toBeVisible();
  await expect(popup).not.toHaveClass(/scrollable/);
  await content.evaluate(el => { (el as HTMLElement).style.minHeight = '2400px'; });
  await expect(popup).toHaveClass(/scrollable/);
  await expect(popup).toHaveCSS('pointer-events', 'auto');
  expect(await popup.evaluate(el => el.getBoundingClientRect().bottom <= window.innerHeight - 7)).toBe(true);
  await content.evaluate(el => { (el as HTMLElement).style.minHeight = ''; });
  await expect(popup).not.toHaveClass(/scrollable/);
  await expect(popup).toHaveCSS('pointer-events', 'none');
}

test('deadline line follows selection, half-day edits, zoom, scrolling and theme', async ({ page }) => {
  await page.getByRole('button', { name: '天', exact: true }).click();
  const line = page.getByTestId('task-deadline-line');
  await expect(line).toHaveCount(0);
  await page.getByTestId('bar-task-engine').click();
  await expect(line).toContainText('截止 · 2026-09-17 下午');
  await expect(line).toHaveCSS('pointer-events', 'none');
  await expect(line).not.toHaveCSS('box-shadow', 'none');
  const distance = () => line.evaluate(el => Number.parseFloat((el as HTMLElement).style.left) - Number.parseFloat((document.querySelector('.time-background') as HTMLElement).style.left));
  const origin = (await page.locator('.gantt-caption>span').first().textContent())!.split(' — ')[0];
  const days = (Date.parse('2026-09-18') - Date.parse(origin)) / 86400000;
  expect(await distance()).toBeCloseTo(days * 72, 1);
  await selectChoice(page, '最迟需完成时间时段', 'am');
  await expect.poll(distance).toBeCloseTo((days - 0.5) * 72, 1);
  // The fixed task editor overlays the zoom control; keyboard activation keeps selection intact.
  await page.getByRole('button', { name: '放大甘特图', exact: true }).press('Enter');
  await expect.poll(distance).toBeCloseTo((days - 0.5) * 72 * 1.25, 1);
  const before = (await line.boundingBox())!.x;
  const scroll = page.locator('.gantt-scroll');
  await scroll.evaluate(el => { el.scrollLeft += 60; });
  await expect.poll(async () => (await line.boundingBox())!.x).toBeCloseTo(before - 60, 1);
  await page.getByRole('button', { name: '切换到暗色主题' }).click();
  await expect(line).toHaveCSS('border-left-color', 'rgb(203, 155, 255)');
  await page.getByLabel('最迟需完成时间', { exact: true }).fill('');
  await expect(line).toHaveCount(0);
  await page.getByLabel('最迟需完成时间', { exact: true }).fill('2027-01-15');
  await expect(line).toHaveCount(1);
  expect(await line.evaluate(el => Number.parseFloat((el as HTMLElement).style.left) < (document.querySelector('.gantt-canvas') as HTMLElement).offsetWidth)).toBe(true);
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await expect(line).toHaveCount(0);
  await page.getByTestId('bar-task-design').click();
  await expect(line).toHaveCount(0);
});

test('parents never show deadline lines and filtered-out selections hide them', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json();
  data.project.tasks.push({ ...data.project.tasks[0], uid: 'parent', name: '父任务', order: 7, latest_finish: { date: '2026-09-30', period: 'pm' } });
  data.project.tasks[0].parent_uid = 'parent';
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  await page.locator('.tree-task-cell[data-task-uid="parent"] .task-title').click();
  await expect(page.getByTestId('task-deadline-line')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.getByTestId('bar-task-engine').click();
  await expect(page.getByTestId('task-deadline-line')).toHaveCount(1);
  await page.getByRole('group', { name: '标签筛选', exact: true }).getByRole('button', { name: '设计', exact: true }).click();
  await expect(page.getByTestId('task-deadline-line')).toHaveCount(0);
});

test('editor hover remeasures uncapped contents and cleans up on window blur', async ({ page }) => {
  await page.getByTestId('bar-task-design').hover();
  await growAndShrink(page.locator('.hover-card'));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('.hover-card')).toHaveCount(0);
  await page.mouse.move(5, 5);
  await page.getByTestId('bar-task-design').hover();
  await expect(page.locator('.hover-card')).toBeVisible();
});

test('offline hover responds to content resizing without reentering the task', async ({ page }, testInfo) => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出交互式 HTML' }).click();
  const output = testInfo.outputPath('resizing-popup.html');
  await (await pending).saveAs(output);
  await page.goto(pathToFileURL(output).href);
  await page.locator('.bar[data-uid="task-design"]').hover();
  await growAndShrink(page.locator('#hover-preview'));
});


test('early deadlines preserve task screen positions through selection, edits and dismissal', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json();
  data.project.tasks.find((task: { uid: string }) => task.uid === 'task-engine').latest_finish = { date: '2026-08-01', period: 'pm' };
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  const bar = page.getByTestId('bar-task-engine');
  await expect(bar).toBeVisible();
  const x = (await bar.boundingBox())!.x;
  const reference = page.getByTestId('bar-task-discovery');
  const referenceX = (await reference.boundingBox())!.x;
  const stable = async () => {
    await expect.poll(async () => (await bar.boundingBox())!.x).toBeCloseTo(x, 1);
    await expect.poll(async () => (await reference.boundingBox())!.x).toBeCloseTo(referenceX, 1);
  };
  await bar.click();
  await expect(page.getByTestId('task-deadline-line')).toContainText('2026-08-01');
  await stable();
  await page.getByLabel('最迟需完成时间', { exact: true }).fill('2026-07-01');
  await expect(page.getByTestId('task-deadline-line')).toContainText('2026-07-01');
  await stable();
  await page.getByLabel('最迟需完成时间', { exact: true }).fill('2026-08-15');
  await stable();
  await page.locator('.tree-task-cell[data-task-uid="task-design"] .task-title').click();
  await expect(page.getByTestId('task-deadline-line')).toHaveCount(0);
  await stable();
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await stable();
});

test('distant deadline space remains scrollable after dismissal and when starting a pan', async ({ page }) => {
  await page.getByTestId('bar-task-engine').click();
  await page.getByLabel('最迟需完成时间', { exact: true }).fill('2027-01-15');
  const scroll = page.locator('.gantt-scroll');
  await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth - el.clientWidth - 100; });
  const left = await scroll.evaluate(el => el.scrollLeft);
  expect(left).toBeGreaterThan(1000);
  const x = (await page.getByTestId('bar-task-engine').boundingBox())!.x;
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeCloseTo(left, 1);
  expect((await page.getByTestId('bar-task-engine').boundingBox())!.x).toBeCloseTo(x, 1);
  await page.locator('.tree-task-cell[data-task-uid="task-engine"] .task-title').click();
  const header = await page.locator('.time-heading-viewport').boundingBox();
  await page.mouse.move(header!.x + 100, header!.y + 20);
  await page.mouse.down();
  await expect(page.getByTestId('task-deadline-line')).toHaveCount(0);
  await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeCloseTo(left, 1);
  await page.mouse.move(header!.x + 140, header!.y + 20);
  await page.mouse.up();
  await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeCloseTo(left - 40, 1);
});

test('switching projects resets retained deadline space', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json();
  data.project.tasks.find((task: { uid: string }) => task.uid === 'task-engine').latest_finish = { date: '2027-01-15', period: 'pm' };
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  const scroll = page.locator('.gantt-scroll');
  await expect(page.getByTestId('bar-task-engine')).toBeVisible();
  const initialWidth = await scroll.evaluate(el => el.scrollWidth);
  await page.getByTestId('bar-task-engine').click();
  await expect.poll(() => scroll.evaluate(el => el.scrollWidth)).toBeGreaterThan(initialWidth);
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await selectChoice(page, '选择项目文件', 'project_c5.yaml');
  await expect(page.getByRole('heading', { name: 'C5 项目' })).toBeVisible();
  await expect.poll(() => scroll.evaluate(el => el.scrollWidth)).toBe(initialWidth);
  await selectChoice(page, '选择项目文件', 'example_project.yaml');
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
  await expect.poll(() => scroll.evaluate(el => el.scrollWidth)).toBe(initialWidth);
});
