import type { Project, Task } from './model';

export type Theme = Project['project']['theme'];
type Status = Task['status'];
type StatusColor = { fill: string; border: string; text: string };

/** Shared palettes for the editor, legend, and offline export. */
export const statusColorsByTheme: Record<Theme, Record<Status, StatusColor>> = {
  light: {
    '未开始': { fill: '#e5e7eb', border: '#cbd5e1', text: '#64748b' },
    '进行中': { fill: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' },
    '验收中': { fill: '#ffedd5', border: '#fdba74', text: '#c2410c' },
    '已完成': { fill: '#dcfce7', border: '#86efac', text: '#15803d' },
  },
  dark: {
    '未开始': { fill: '#707070', border: '#c6c6c6', text: '#ffffff' },
    '进行中': { fill: '#1d4ed8', border: '#60a5fa', text: '#ffffff' },
    '验收中': { fill: '#c2410c', border: '#fb923c', text: '#ffffff' },
    '已完成': { fill: '#15803d', border: '#4ade80', text: '#ffffff' },
  },
};

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
