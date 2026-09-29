import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/projects/select', { data: { name: 'example_project.yaml' } });
  const { file } = await (await request.get('/api/project')).json();
  const project = parse(await readFile('tests/e2e-project.yaml', 'utf8'));
  for (let index = 7; index <= 80; index++) project.tasks.push({ ...structuredClone(project.tasks[0]), uid: `tall-${index}`, order: index, name: `长列表任务 ${index}`, description: '', status: '未开始', duration_days: 2 });
  await writeFile(file, stringify(project));
  await page.goto('/');
  await expect(page.locator('.task-bar')).toHaveCount(80);
  await page.getByRole('button', { name: '天', exact: true }).click();
});

async function scrollDown(page: Page) {
  await page.locator('.gantt-grid').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + 500));
  await expect.poll(async () => (await page.locator('.gantt-header').boundingBox())!.y).toBeCloseTo(0, 1);
}

async function alignment(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    return {
      axisError: Math.abs(box('.time-heading').x - box('.time-background').x),
      cornerError: Math.abs(box('.task-heading').x - box('.tree-task-labels').x),
      headerTop: box('.gantt-header').top,
    };
  });
}

test('date header sticks to the page only within the Gantt and columns stay fixed during rapid scrolls', async ({ page }, testInfo) => {
  const header = page.locator('.gantt-header');
  expect((await header.boundingBox())!.y).toBeGreaterThan(0);
  await expect(page.locator('.tree-task-labels')).toHaveCSS('position', 'sticky');
  await expect(page.locator('.tree-task-labels')).toHaveCSS('transform', 'none');
  await expect(page.locator('.time-heading')).toHaveAttribute('data-native-scroll', 'true');
  await scrollDown(page);
  const samples = await page.evaluate(async () => {
    const scroll = document.querySelector('.gantt-scroll')!;
    const labels = document.querySelector('.tree-task-labels')!;
    const reference = labels.getBoundingClientRect().x;
    const values = [];
    for (const left of [0, 170, 60, 310, 120, 450, 90, 300, 0]) {
      scroll.scrollLeft = left;
      // Check the frozen column synchronously, before a scroll handler or React render could compensate.
      const frozenError = Math.abs(labels.getBoundingClientRect().x - reference);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      values.push({ frozenError, axisError: Math.abs(document.querySelector('.time-heading')!.getBoundingClientRect().x - document.querySelector('.time-background')!.getBoundingClientRect().x), top: document.querySelector('.gantt-header')!.getBoundingClientRect().top });
    }
    return values;
  });
  for (const sample of samples) {
    expect(sample.frozenError).toBeLessThan(0.1);
    expect(sample.axisError).toBeLessThan(1);
    expect(sample.top).toBeCloseTo(0, 1);
  }
  await page.screenshot({ path: testInfo.outputPath('sticky-header.png') });
  await page.evaluate(() => {
    const spacer = document.createElement('div'); spacer.style.height = '1200px'; document.body.appendChild(spacer);
    const grid = document.querySelector('.gantt-grid')!;
    window.scrollTo(0, grid.getBoundingClientRect().bottom + window.scrollY + 80);
  });
  await expect.poll(async () => (await header.boundingBox())!.y + (await header.boundingBox())!.height).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => (await header.boundingBox())!.y).toBeGreaterThan(0);
});

test('dragging, resizing, zooming and dark theme retain header alignment', async ({ page }) => {
  await scrollDown(page);
  const header = (await page.locator('.time-heading-viewport').boundingBox())!;
  const x = header.x + 250, y = header.y + 20;
  await page.mouse.move(x, y); await page.mouse.down();
  for (const delta of [40, 90, 150, 200, 130, 220]) {
    await page.mouse.move(x - delta, y);
    await expect.poll(async () => (await alignment(page)).axisError).toBeLessThan(1);
    const value = await alignment(page);
    expect(value.cornerError).toBeLessThan(0.1);
    expect(value.headerTop).toBeCloseTo(0, 1);
  }
  await page.mouse.up();
  expect(await page.locator('.gantt-scroll').evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  const resize = (await page.getByRole('separator', { name: '调整任务列表宽度' }).boundingBox())!;
  await page.mouse.move(resize.x + 5, resize.y + 20); await page.mouse.down();
  await page.mouse.move(resize.x + 85, resize.y + 20, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('.tree-task-labels')).toHaveCSS('width', '340px');
  await expect(page.locator('.task-heading')).toHaveCSS('width', '340px');
  await expect.poll(async () => (await alignment(page)).axisError).toBeLessThan(1);
  await page.getByRole('button', { name: '放大甘特图', exact: true }).press('Enter');
  await scrollDown(page);
  await expect.poll(async () => (await alignment(page)).axisError).toBeLessThan(1);
  await page.getByRole('button', { name: '切换到暗色主题' }).click();
  await scrollDown(page);
  await expect(page.locator('.gantt-header')).not.toHaveCSS('background-color', 'rgb(248, 250, 247)');
  await expect.poll(async () => (await alignment(page)).axisError).toBeLessThan(1);
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(async () => (await alignment(page)).axisError).toBeLessThan(1);
});

test('fallback date synchronization avoids React state and preserves native frozen columns', async ({ page }) => {
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (property: string, value?: string) => property === 'animation-timeline' || property === 'timeline-scope' ? false : value === undefined ? supports(property) : supports(property, value);
  });
  await page.reload();
  await expect(page.locator('.time-heading')).toHaveAttribute('data-native-scroll', 'false');
  await scrollDown(page);
  await page.locator('.gantt-scroll').evaluate(el => { el.scrollLeft = 140; });
  await expect.poll(async () => (await alignment(page)).axisError).toBeLessThan(1);
  expect((await alignment(page)).cornerError).toBeLessThan(0.1);
  await page.setViewportSize({ width: 1050, height: 800 });
  await expect.poll(async () => (await alignment(page)).axisError).toBeLessThan(1);
});
