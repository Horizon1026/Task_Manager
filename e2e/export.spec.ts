import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { stringify } from 'yaml';
import { GANTT_SIZING } from '../src/ganttSizing';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/projects/select', { data: { name: 'project.yaml' } });
  const { file } = await (await request.get('/api/project')).json();
  await writeFile(file, await readFile('tests/e2e-project.yaml', 'utf8'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
});

test('exports one offline HTML file whose tasks and dependencies remain interactive', async ({ page }, testInfo) => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出交互式 HTML' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^TaskManager 示例项目_甘特图_\d{4}-\d{2}-\d{2}\.html$/);
  const output = testInfo.outputPath('interactive-gantt.html');
  await download.saveAs(output);

  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(pathToFileURL(output).href);
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
  await expect(page.locator('.bar')).toHaveCount(6);
  await expect(page.locator('.edge')).toHaveCount(6);
  const arrowPosition = await page.locator('.edge').first().evaluate(group => {
    const path = group.querySelector('path') as SVGPathElement;
    const arrow = group.querySelector('.edge-arrowhead') as SVGLineElement;
    const midpoint = path.getPointAtLength(path.getTotalLength() / 2);
    const arrowCenter = {
      x: (Number(arrow.getAttribute('x1')) + Number(arrow.getAttribute('x2'))) / 2,
      y: (Number(arrow.getAttribute('y1')) + Number(arrow.getAttribute('y2'))) / 2,
    };
    return {
      distance: Math.hypot(midpoint.x - arrowCenter.x, midpoint.y - arrowCenter.y),
      curveMarker: path.getAttribute('marker-end'),
      arrowMarker: arrow.getAttribute('marker-end'),
    };
  });
  expect(arrowPosition.distance).toBeLessThan(0.5);
  expect(arrowPosition.curveMarker).toBeNull();
  expect(arrowPosition.arrowMarker).toBe('url(#arrow)');
  await page.locator('.bar[data-uid="task-design"]').hover();
  await expect(page.locator('.edge.related')).toHaveCount(2);
  await expect(page.locator('.bar')).toHaveCount(6);
  await expect(page.locator('.bar[data-uid="task-release"]')).not.toHaveClass(/dim/);
  await page.locator('.bar[data-uid="task-design"]').click();
  await expect(page.locator('#details')).toBeVisible();
  await expect(page.locator('#details')).toContainText('交互与视觉设计');
  await expect(page.locator('#details')).toContainText('需求梳理');
  await expect(page.locator('.edge.related')).toHaveCount(2);
  await expect(page.locator('.bar')).toHaveCount(3);
  await expect(page.locator('.bar[data-uid="task-release"]')).toHaveCount(0);
  const scroll = page.locator('#scroll');
  await scroll.evaluate(element => { element.scrollLeft = 100; });
  const beforePan = await scroll.evaluate(element => element.scrollLeft);
  const scrollBox = (await scroll.boundingBox())!;
  await page.mouse.move(scrollBox.x + 400, scrollBox.y + 25);
  await page.mouse.down();
  await page.mouse.move(scrollBox.x + 320, scrollBox.y + 25, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(beforePan + 40);
  await expect(page.locator('#details')).toBeVisible();
  await expect(page.locator('.bar')).toHaveCount(3);
  await scroll.click({ position: { x: scrollBox.width - 40, y: 350 } });
  await expect(page.locator('.bar')).toHaveCount(6);
  await page.getByRole('button', { name: '月', exact: true }).click();
  await expect(page.getByRole('button', { name: '月', exact: true })).toHaveClass(/active/);
});

test('exported parent tasks ignore clicks while their collapse control remains available', async ({ page, request }, testInfo) => {
  const data = await (await request.get('/api/project')).json();
  const discovery = data.project.tasks.find((task: { uid: string }) => task.uid === 'task-discovery');
  const design = data.project.tasks.find((task: { uid: string }) => task.uid === 'task-design');
  design.parent_uid = discovery.uid;
  design.dependencies = [];
  for (const task of data.project.tasks) task.dependencies = [...new Set(task.dependencies.map((uid: string) => uid === discovery.uid ? design.uid : uid))];
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  await expect(page.getByTestId('bar-task-discovery')).toHaveClass(/parent-task-bar/);

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出交互式 HTML' }).click();
  const download = await pending;
  const output = testInfo.outputPath('parent-interaction.html');
  await download.saveAs(output);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(pathToFileURL(output).href);

  const parent = page.locator('.bar.parent[data-uid="task-discovery"]');
  await expect(parent).toBeVisible();
  const parentLabel = page.locator('.label.parent[data-uid="task-discovery"]');
  const childLabel = page.locator('.label[data-uid="task-design"]');
  const parentLabelBox = (await parentLabel.boundingBox())!;
  const childLabelBox = (await childLabel.boundingBox())!;
  expect(parentLabelBox.height).toBe(GANTT_SIZING.barHeight);
  expect(parentLabelBox.y + parentLabelBox.height).toBeLessThan(childLabelBox.y);
  const scroll = page.locator('#scroll');
  await scroll.evaluate(element => { element.scrollLeft = 100; });
  const beforePan = await scroll.evaluate(element => element.scrollLeft);
  const parentBox = (await parent.boundingBox())!;
  await page.mouse.move(parentBox.x + parentBox.width / 2, parentBox.y + 16);
  await page.mouse.down();
  await page.mouse.move(parentBox.x + parentBox.width / 2 - 70, parentBox.y + 16, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(beforePan + 30);
  await expect(page.locator('#details')).toBeHidden();
  await expect(page.locator('.bar')).toHaveCount(6);
  await parent.click();
  await expect(page.locator('#details')).toBeHidden();
  await expect(page.locator('.bar')).toHaveCount(6);
  await expect(parent).not.toHaveClass(/selected/);
  await page.locator('.bar[data-uid="task-design"]').click();
  await expect(page.locator('#details')).toBeVisible();
  await expect(page.locator('.bar')).toHaveCount(4);
  await parent.click();
  await expect(page.locator('#details')).toBeHidden();
  await expect(page.locator('.bar')).toHaveCount(6);
  await page.locator('[data-collapse="task-discovery"]').click();
  await expect(page.locator('.bar[data-uid="task-design"]')).toHaveCount(0);
});

test('exported HTML includes generated assignee dependencies without persisting them on tasks', async ({ page, request }, testInfo) => {
  const data = await (await request.get('/api/project')).json();
  data.project.project.allow_assignee_parallel_tasks = false;
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出交互式 HTML' }).click();
  const download = await pending;
  const output = testInfo.outputPath('assignee-serialization.html');
  await download.saveAs(output);
  await page.goto(pathToFileURL(output).href);
  await page.locator('.bar[data-uid="task-release"]').click();
  await expect(page.locator('.edge.assignee')).toHaveCount(1);
  await expect(page.locator('#details')).toContainText('半天排期引擎（自动串行）');
  expect(data.project.tasks.find((task: { uid: string }) => task.uid === 'task-release').dependencies).toEqual(['task-qa']);
});
