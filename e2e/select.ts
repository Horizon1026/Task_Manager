import type { Page } from '@playwright/test';

export async function selectChoice(page: Page, label: string, value: string) {
  const input = page.getByRole('combobox', { name: label, exact: true });
  await input.click();
  await input.fill(value);
  await page.getByRole('listbox').locator(`[role="option"][data-value="${value}"]`).click();
}
