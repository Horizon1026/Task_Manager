import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { project, task } from '../tests/fixtures';
import { selectChoice } from './select';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/projects/select', { data: { name: 'example_project.yaml' } });
  const { file } = await (await request.get('/api/project')).json();
  await writeFile(file, stringify(project([
    task('a', { dependencies: ['b'], duration_days: 2 }), task('b', { duration_days: 2 }),
    task('c', { duration_days: 2 }), task('d', { duration_days: 2 }),
  ])));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '测试项目' })).toBeVisible();
});

async function point(page: Page, uid: string) {
  const box = (await page.getByTestId(`bar-${uid}`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + 12 };
}
async function startParentDrag(page: Page, source: string, target: string) {
  const from = await point(page, source), to = await point(page, target);
  await page.keyboard.down('r');
  await page.mouse.move(from.x, from.y); await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x, to.y, { steps: 6 });
}
async function endParentDrag(page: Page) {
  await page.mouse.up({ button: 'right' }); await page.keyboard.up('r');
}
async function details(page: Page, uid: string) {
  await page.locator(`.tree-task-cell[data-task-uid="${uid}"] .task-title`).click();
}
async function dragFromDetails(page: Page, target: string, parent = false) {
  const handle = (await page.getByTestId('detail-relation-handle').boundingBox())!;
  const row = (await page.locator(`.tree-task-cell[data-task-uid="${target}"]`).boundingBox())!;
  if (parent) await page.keyboard.down('r');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(row.x + 15, row.y + row.height / 2, { steps: 8 });
}

test('dropdown migrates both dependency directions only to the first child and persists on explicit save', async ({ page, request }) => {
  const initial = await (await request.get('/api/project')).json();
  initial.project.tasks.push(task('e', { order: 5, dependencies: ['a'], duration_days: 2 }));
  await writeFile(initial.file, stringify(initial.project));
  await page.reload();
  await details(page, 'c');
  await selectChoice(page, '父任务', 'a');
  await expect(page.locator('.dependency-list')).toContainText('b');
  await expect(page.getByRole('status')).toContainText('前置依赖已迁移');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await details(page, 'd');
  await selectChoice(page, '父任务', 'a');
  await expect(page.locator('.dependency-list')).toContainText('无前置依赖');
  const before = await (await request.get('/api/project')).json();
  expect(before.project.tasks.find((t: { uid: string }) => t.uid === 'a').dependencies).toEqual(['b']);
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const { project: saved } = await (await request.get('/api/project')).json();
  expect(saved.tasks.map((t: { uid: string }) => t.uid)).toEqual(['a', 'c', 'd', 'b', 'e']);
  expect(saved.tasks[0].dependencies).toEqual([]);
  expect(saved.tasks[1].dependencies).toEqual(['b']);
  expect(saved.tasks[2].dependencies).toEqual([]);
  expect(saved.tasks.find((t: { uid: string }) => t.uid === 'e').dependencies).toEqual(['c']);
  await page.reload();
  await details(page, 'c');
  await expect(page.getByLabel('父任务', { exact: true })).toHaveValue('1. a');
  await expect(page.locator('.dependency-list')).toContainText('b');
});

test('R-right-drag latches parent mode, migrates dependencies and supports moving a subtree', async ({ page, request }) => {
  await startParentDrag(page, 'c', 'a');
  await expect(page.locator('.parent-drag-arrow > path')).toHaveCSS('stroke', 'rgb(124, 58, 237)');
  await expect(page.getByTestId('bar-a')).toHaveClass(/parent-drop-valid/);
  await page.keyboard.up('r'); // Releasing R mid-gesture must not turn it into a dependency.
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('bar-a')).toHaveClass(/parent-task-bar/);
  await expect(page.getByRole('status')).toContainText('前置依赖已迁移');
  await startParentDrag(page, 'a', 'c');
  await expect(page.getByTestId('bar-c')).toHaveClass(/parent-drop-invalid/);
  await endParentDrag(page);
  await expect(page.getByRole('status')).toContainText('不能承接前置依赖');
  await startParentDrag(page, 'a', 'd');
  await endParentDrag(page);
  await expect(page.getByTestId('bar-d')).toHaveClass(/parent-task-bar/);
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const { project: saved } = await (await request.get('/api/project')).json();
  expect(saved.tasks.find((t: { uid: string }) => t.uid === 'c').parent_uid).toBe('a');
  expect(saved.tasks.find((t: { uid: string }) => t.uid === 'a').parent_uid).toBe('d');
  expect(saved.tasks.find((t: { uid: string }) => t.uid === 'c').dependencies).toEqual(['b']);
});

test('parent drag cancellation and typing R leave ordinary right-drag unchanged', async ({ page }) => {
  await startParentDrag(page, 'c', 'a');
  await page.keyboard.press('Escape'); await endParentDrag(page);
  await expect(page.locator('.parent-drag-arrow')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  await startParentDrag(page, 'c', 'a');
  await page.mouse.move(20, 20); await endParentDrag(page);
  await expect(page.getByRole('status')).toContainText('已取消设置父任务');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  await startParentDrag(page, 'c', 'a');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await endParentDrag(page);
  await expect(page.locator('.parent-drag-arrow')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');

  await details(page, 'c');
  await page.getByLabel('任务名称', { exact: true }).focus();
  await page.keyboard.down('r'); // A letter typed in the editor must not enable parent mode.
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  const from = await point(page, 'c'), to = await point(page, 'd');
  await page.mouse.move(from.x, from.y); await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect(page.locator('.drag-arrow')).toBeVisible();
  await expect(page.locator('.parent-drag-arrow')).toHaveCount(0);
  await endParentDrag(page);
  await expect(page.getByRole('status')).toContainText('依赖已添加');
  await details(page, 'c');
  await expect(page.getByLabel('父任务', { exact: true })).toHaveValue('无（根任务）');
  await expect(page.getByRole('button', { name: '移除依赖 d', exact: true })).toBeVisible();
});

test('task details relation area makes the current task depend on the drop target', async ({ page, request }) => {
  await details(page, 'c');
  await dragFromDetails(page, 'd');
  await expect(page.locator('.drag-arrow')).toBeVisible();
  await expect(page.locator('.parent-drag-arrow')).toHaveCount(0);
  await page.mouse.up({ button: 'right' });
  await expect(page.getByRole('status')).toContainText('依赖已添加');
  await expect(page.getByLabel('任务详情编辑')).toBeVisible();
  await expect(page.getByTestId('detail-relation-handle')).not.toHaveClass(/dependency/);
  await expect(page.getByRole('button', { name: '移除依赖 d', exact: true })).toBeVisible();
  expect((await (await request.get('/api/project')).json()).project.tasks.find((t: { uid: string }) => t.uid === 'c').dependencies).toEqual([]);
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  expect((await (await request.get('/api/project')).json()).project.tasks.find((t: { uid: string }) => t.uid === 'c').dependencies).toEqual(['d']);
});

test('R-right-drag from task details sets a parent, previews validity, and moves a parent subtree', async ({ page, request }) => {
  await details(page, 'c');
  await dragFromDetails(page, 'a', true);
  await expect(page.locator('.parent-drag-arrow > path')).toHaveCSS('stroke', 'rgb(124, 58, 237)');
  await expect(page.getByTestId('bar-a')).toHaveClass(/parent-drop-valid/);
  await page.keyboard.up('r'); // Mode remains latched after the gesture starts.
  await page.mouse.up({ button: 'right' });
  await expect(page.getByRole('status')).toContainText('前置依赖已迁移');
  await expect(page.getByLabel('父任务', { exact: true })).toHaveValue('1. a');
  await expect(page.getByRole('button', { name: '移除依赖 b', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭任务详情' }).click();

  await details(page, 'a');
  const handle = page.getByTestId('detail-relation-handle');
  await expect(handle).toContainText('按住 R 后右键拖到任务');
  await dragFromDetails(page, 'd'); // A parent cannot create an ordinary dependency.
  await expect(page.locator('.drag-arrow')).toHaveCount(0);
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('save-state')).toContainText('未保存');
  await dragFromDetails(page, 'd', true);
  await page.mouse.up({ button: 'right' }); await page.keyboard.up('r');
  await expect(page.getByRole('status')).toContainText('父任务已更新');
  await expect(page.getByLabel('父任务', { exact: true })).toHaveValue('2. d');
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const { project: saved } = await (await request.get('/api/project')).json();
  expect(saved.tasks.find((t: { uid: string }) => t.uid === 'a').parent_uid).toBe('d');
  expect(saved.tasks.find((t: { uid: string }) => t.uid === 'c').parent_uid).toBe('a');
  expect(saved.tasks.find((t: { uid: string }) => t.uid === 'c').dependencies).toEqual(['b']);
});

test('task details relation drag cancels on Escape, blank drop, and window blur', async ({ page }) => {
  await details(page, 'c');
  await dragFromDetails(page, 'd');
  await page.keyboard.press('Escape'); await page.mouse.up({ button: 'right' });
  await expect(page.locator('.drag-arrow')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  await dragFromDetails(page, 'd', true);
  await page.mouse.move(20, 20); await page.mouse.up({ button: 'right' }); await page.keyboard.up('r');
  await expect(page.getByRole('status')).toContainText('已取消设置父任务');
  await dragFromDetails(page, 'd');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('.drag-arrow')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  await expect(page.getByLabel('任务详情编辑')).toBeVisible();
});

test('double-clicking a parent row collapses descendants, projects dependencies, and saves the state', async ({ page, request }) => {
  await details(page, 'c');
  await selectChoice(page, '父任务', 'a');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await details(page, 'd');
  await selectChoice(page, '父任务', 'a');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  const parentRow = page.locator('.tree-task-cell[data-task-uid="a"] .task-title');
  await parentRow.hover();
  await expect(page.locator('.hover-card')).toHaveCount(0);

  await parentRow.dblclick();
  await expect(page.getByTestId('bar-c')).toHaveCount(0);
  await expect(page.getByTestId('bar-d')).toHaveCount(0);
  await expect(page.getByTestId('bar-a')).toHaveClass(/collapsed-parent-task-bar/);
  await expect(page.getByLabel('折叠子任务')).toBeChecked();
  await expect(page.locator('.dependency-arrow')).toHaveCount(1);
  await expect(page.getByTestId('save-state')).toContainText('未保存');

  await page.getByTestId('bar-a').dblclick();
  await expect(page.getByTestId('bar-c')).toHaveCount(0);
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const { project: saved } = await (await request.get('/api/project')).json();
  expect(saved.tasks.find((task: { uid: string }) => task.uid === 'a').collapse_children).toBe(true);
  expect(saved.tasks.find((task: { uid: string }) => task.uid === 'c').dependencies).toEqual(['b']);

  await page.reload();
  await expect(page.getByTestId('bar-c')).toHaveCount(0);
  await page.locator('.tree-task-cell[data-task-uid="a"] .task-title').dblclick();
  await expect(page.getByTestId('bar-c')).toBeVisible();
  await expect(page.getByTestId('bar-d')).toBeVisible();
});
