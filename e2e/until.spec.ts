import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, stringify } from 'yaml';
import { project, task } from '../tests/fixtures';

test('U-right-drag creates an occupied until relation and Ctrl+S backs up the prior YAML', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 2200, height: 1000 });
  await request.post('/api/projects/select', { data: { name: 'example_project.yaml' } });
  const { file } = await (await request.get('/api/project')).json();
  const initial = project([
    task('a', { duration_days: 0.5, latest_finish: { date: '2026-09-14', period: 'pm' } }),
    task('b', { earliest_start: { date: '2026-09-16', period: 'am' }, dependencies: ['a'] }),
    task('c', { dependencies: ['a'] }),
  ]);
  await writeFile(file, stringify(initial));
  await page.goto('/');
  const a = (await page.getByTestId('bar-a').boundingBox())!;
  const b = (await page.getByTestId('bar-b').boundingBox())!;
  await page.keyboard.down('u');
  await page.mouse.move(a.x + a.width / 2, a.y + 12);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x + b.width / 2, b.y + 12, { steps: 8 });
  await expect(page.locator('.until-drag-arrow')).toBeVisible();
  await page.mouse.up({ button: 'right' });
  await page.keyboard.up('u');
  await expect(page.getByRole('status')).toContainText('until 关系已添加');
  await expect(page.getByTestId('bar-a').locator('.until-tail')).toBeVisible();
  const afterA = (await page.getByTestId('bar-a').boundingBox())!;
  const afterC = (await page.getByTestId('bar-c').boundingBox())!;
  expect(afterA.width).toBeGreaterThan(a.width);
  expect(afterC.x).toBeGreaterThanOrEqual(afterA.x + afterA.width - 1);
  await page.getByTestId('bar-a').click();
  await expect(page.locator('.dependency-arrow')).toHaveCount(3);
  await page.getByRole('button', { name: '天', exact: true }).click();
  await expect(page.locator('.dependency-arrow, .dependency-arrowhead')).toHaveCount(0);
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const saved = parse(await readFile(file, 'utf8'));
  expect(saved.tasks[0].until).toEqual(['b']);
  const backups = (await (await request.get('/api/backups')).json()).backups as string[];
  const prior = backups.find(name => name.includes('_initial_'))!;
  expect(parse(await readFile(join(file.slice(0, file.lastIndexOf('/')), 'backups', 'example_project', prior), 'utf8')).tasks[0].until).toBeUndefined();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出交互式 HTML' }).click();
  const output = testInfo.outputPath('until.html');
  await (await download).saveAs(output);
  await page.goto(pathToFileURL(output).href);
  await expect(page.locator('.bar[data-uid="a"] .until-tail')).toBeVisible();
});
