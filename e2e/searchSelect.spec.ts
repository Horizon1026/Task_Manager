import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { selectChoice } from './select';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/projects/select', { data: { name: 'project.yaml' } });
  const { file } = await (await request.get('/api/project')).json();
  await writeFile(file, await readFile('tests/e2e-project.yaml', 'utf8'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
});

test('task choices search by Chinese, pinyin, initials, UID and order; arrows and Enter confirm', async ({ page }) => {
  await page.getByTestId('bar-task-discovery').click();
  const input = page.getByRole('combobox', { name: '选择前置任务', exact: true });
  for (const query of ['交互', 'jiaohu', 'JHYSJS', 'TASK-DESIGN', '2']) {
    await input.fill(query);
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveText('2. 交互与视觉设计');
  }
  await input.fill('');
  await expect(page.getByRole('option')).toHaveCount(6);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('2. 交互与视觉设计');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步'); // Not added yet.
});

test('search never commits on Escape, Tab, outside click, no match, or Ctrl+S', async ({ page, request }) => {
  await page.getByTestId('bar-task-discovery').click();
  const input = page.getByRole('combobox', { name: '执行人', exact: true });
  await input.fill('xiaoch'); await page.keyboard.press('Escape');
  await expect(input).toHaveValue('小林');
  await page.keyboard.type('xc');
  await expect(input).toHaveValue('xc');
  await expect(page.getByRole('option')).toHaveText('小陈');
  await page.keyboard.press('Escape');
  await input.fill('xc'); await page.keyboard.press('Tab');
  await expect(input).toHaveValue('小林');
  await expect(page.getByRole('combobox', { name: '当前状态' })).toBeFocused();
  await input.fill('xc'); await page.getByLabel('任务名称', { exact: true }).click();
  await expect(input).toHaveValue('小林');
  await input.fill('并不存在的执行人'); await page.keyboard.press('Enter');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(page.getByText('无匹配选项', { exact: true })).toBeVisible();
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  await page.keyboard.press('Escape');
  await input.fill('xc'); await page.keyboard.press('Control+s');
  await expect(input).toHaveValue('小林');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const { project } = await (await request.get('/api/project')).json();
  expect(project.tasks[0].assignee).toBe('小林');
});

test('IME composition Enter does not commit; explicit Enter afterwards does', async ({ page, request }) => {
  await page.getByTestId('bar-task-discovery').click();
  const input = page.getByRole('combobox', { name: '当前状态' });
  await input.click();
  await input.dispatchEvent('compositionstart');
  await input.fill('验收中');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  await input.dispatchEvent('compositionend', { data: '验收中' });
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('验收中');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('save-state')).toContainText('未保存');
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
  const { project } = await (await request.get('/api/project')).json();
  expect(project.tasks[0].status).toBe('验收中');
});

test('project search does not switch until confirmation and cancelled dirty switch restores selected label', async ({ page, request }) => {
  const picker = page.getByRole('combobox', { name: '选择项目文件' });
  await picker.fill('C5');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'TaskManager 示例项目' })).toBeVisible();
  expect((await (await request.get('/api/project')).json()).file).toMatch(/\/project.yaml$/);
  await page.keyboard.press('Escape');
  await page.getByTestId('bar-task-discovery').click();
  await page.getByLabel('任务名称', { exact: true }).fill('本地修改');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await selectChoice(page, '选择项目文件', 'project_c5.yaml');
  await expect(picker).toHaveValue('project.yaml');
  await expect(page.getByTestId('save-state')).toContainText('未保存');
});

test('short selects support pinyin and keep null and fieldset-disabled date slots disabled', async ({ page }) => {
  const mode = page.getByRole('combobox', { name: '标签匹配模式' });
  await mode.fill('qbpp'); await page.keyboard.press('Enter');
  await expect(mode).toHaveValue('全部匹配 AND');
  await page.getByTestId('bar-task-discovery').click();
  const period = page.getByRole('combobox', { name: '最早可开始时间时段' });
  await expect(period).toBeDisabled();
  await page.getByLabel('最早可开始时间', { exact: true }).fill('2026-09-14');
  await period.fill('xw'); await page.keyboard.press('Enter');
  await expect(period).toHaveValue('下午');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.getByRole('button', { name: '本地日历', exact: true }).click();
  const day = page.getByRole('combobox', { name: '修正日期类型' });
  await day.fill('xxr');
  await expect(page.getByRole('option', { name: '休息日' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(day).toHaveValue('休息日');
  await page.getByRole('button', { name: '关闭日历', exact: true }).click();
  await page.getByRole('button', { name: '新增任务', exact: false }).click();
  await page.getByLabel('最早可开始时间', { exact: true }).fill('2026-09-14');
  const parentUid = await page.getByLabel('任务 UID').inputValue();
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.getByRole('button', { name: '新增任务', exact: false }).click();
  await selectChoice(page, '父任务', parentUid);
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await page.locator(`.tree-task-cell[data-task-uid="${parentUid}"] .task-title`).click();
  await expect(period).toBeDisabled();
});

test('open choices follow external YAML updates; rejected parent assignment retains old value', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json();
  const picker = page.getByRole('combobox', { name: '选择项目文件' });
  await picker.fill('c5');
  data.project.project.name = '外部刷新';
  await writeFile(data.file, stringify(data.project));
  await expect(page.getByRole('heading', { name: '外部刷新' })).toBeVisible();
  await expect(picker).toHaveValue('c5'); // Local search is not a project draft.
  await page.keyboard.press('Escape');
  await page.getByTestId('bar-task-discovery').click();
  const assignee = page.getByRole('combobox', { name: '执行人', exact: true });
  await assignee.fill('xc');
  data.project.project.assignees.push('新成员');
  data.project.tasks[0].assignee = '新成员';
  await writeFile(data.file, stringify(data.project));
  await expect(assignee).toHaveValue('新成员');
  await assignee.click();
  await expect(page.getByRole('option', { name: '新成员', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await selectChoice(page, '父任务', 'task-design');
  await expect(page.getByRole('status')).toContainText('循环依赖');
  await expect(page.getByRole('combobox', { name: '父任务', exact: true })).toHaveValue('无（根任务）');
  await expect(page.getByTestId('save-state')).toContainText('与 YAML 同步');
});

test('popup escapes scrolling editor clipping, flips upward, and keyboard scrolls to active option', async ({ page, request }) => {
  const data = await (await request.get('/api/project')).json();
  data.project.project.assignees.push(...Array.from({ length: 40 }, (_, i) => `测试成员${i}`));
  await writeFile(data.file, stringify(data.project));
  await page.reload();
  await page.getByTestId('bar-task-discovery').click();
  const input = page.getByRole('combobox', { name: '执行人', exact: true });
  await input.click();
  const popup = page.getByRole('listbox');
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
  expect(await popup.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  const activeId = await input.getAttribute('aria-activedescendant');
  const visible = await popup.evaluate((node, id) => {
    const box = node.getBoundingClientRect(), active = document.getElementById(id!)!.getBoundingClientRect();
    return active.top >= box.top && active.bottom <= box.bottom;
  }, activeId);
  expect(visible).toBe(true);
  await page.keyboard.press('Escape');
  const dependency = page.getByRole('combobox', { name: '选择前置任务' });
  await dependency.click();
  const anchor = (await dependency.boundingBox())!;
  await page.setViewportSize({ width: 1440, height: Math.ceil(anchor.y + anchor.height + 70) });
  await expect.poll(async () => {
    const menu = (await popup.boundingBox())!, field = (await dependency.boundingBox())!;
    return menu.y + menu.height <= field.y;
  }).toBe(true);
  expect(await popup.evaluate(node => node.parentElement === document.body)).toBe(true);
  await page.screenshot({ path: 'test-results/search-select-popup.png' });
  await page.keyboard.press('Escape');
});

test('typing R in search does not enable the parent-drag shortcut', async ({ page }) => {
  await page.getByTestId('bar-task-discovery').click();
  await page.getByRole('combobox', { name: '执行人', exact: true }).click();
  await page.keyboard.down('r');
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  const from = (await page.getByTestId('bar-task-engine').boundingBox())!;
  const to = (await page.getByTestId('bar-task-design').boundingBox())!;
  await page.mouse.move(from.x + 12, from.y + 12); await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x + 12, to.y + 12, { steps: 6 });
  await expect(page.locator('.drag-arrow')).toBeVisible();
  await expect(page.locator('.parent-drag-arrow')).toHaveCount(0);
  await page.mouse.up({ button: 'right' }); await page.keyboard.up('r');
  await expect(page.getByRole('status')).toContainText('依赖已添加');
});
