import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseDocument, stringify } from 'yaml';
import { validateProject, type Project } from '../src/model';
import { scheduleProject } from '../src/schedule';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const revisionOf = (content: string) => createHash('sha256').update(content).digest('hex');
export function parseProject(content: string) {
  const document = parseDocument(content, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors.map(e => e.message).join('\n'));
  const project = validateProject(document.toJS({ maxAliasCount: 50 }));
  scheduleProject(project);
  return project;
}
export class ProjectStore {
  readonly backupDir: string;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly file: string) { this.backupDir = join(dirname(file), 'backups', basename(file, '.yaml')); }
  async read() {
    const content = await readFile(this.file, 'utf8');
    return { project: parseProject(content), revision: revisionOf(content), file: this.file };
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined); return result;
  }
  private async current(expected: unknown) {
    const content = await readFile(this.file, 'utf8');
    if (typeof expected !== 'string' || expected !== revisionOf(content)) throw new HttpError(409, 'YAML 已被外部修改。请先重新加载最新文件，再保存。');
    return content;
  }
  private async backup(content: string, kind: string) {
    await mkdir(this.backupDir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}_${kind}_${randomUUID().slice(0, 8)}.yaml`;
    const handle = await open(join(this.backupDir, name), 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    return name;
  }
  private async replace(content: string, expected: unknown) {
    const temp = join(dirname(this.file), `.${basename(this.file)}.${randomUUID()}.tmp`);
    const mode = (await stat(this.file)).mode & 0o777;
    try {
      const handle = await open(temp, 'wx', mode);
      try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await this.current(expected);
      await rename(temp, this.file);
    } finally { await unlink(temp).catch(() => undefined); }
  }
  save(input: unknown, revision: unknown) {
    return this.serial(async () => {
      const project = validateProject(input); scheduleProject(project);
      project.tasks.sort((a, b) => a.order - b.order);
      const original = await this.current(revision);
      // An initial snapshot makes the first save reversible as well.
      if (!(await this.list()).length) await this.backup(original, 'initial');
      const content = stringify(project, { lineWidth: 0 });
      await this.replace(content, revision);
      let backup: string | null = null, warning: string | null = null;
      try { backup = await this.backup(content, 'saved'); }
      catch (e) { warning = `主 YAML 已保存，但备份失败：${(e as Error).message}`; }
      return { project, revision: revisionOf(content), file: this.file, backup, warning };
    });
  }
  async list() {
    let names: string[];
    try { names = await readdir(this.backupDir); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
    return names.filter(n => /^[\w.-]+\.yaml$/.test(n)).sort().reverse();
  }
  restore(name: unknown, revision: unknown) {
    return this.serial(async () => {
      if (typeof name !== 'string' || !/^[\w.-]+\.yaml$/.test(name) || !(await this.list()).includes(name)) throw new HttpError(400, '无效备份文件');
      const content = await readFile(join(this.backupDir, name), 'utf8');
      const project = parseProject(content);
      const original = await this.current(revision);
      const backup = await this.backup(original, 'before-restore');
      await this.replace(content, revision);
      return { project, revision: revisionOf(content), file: this.file, backup, warning: null };
    });
  }
}
