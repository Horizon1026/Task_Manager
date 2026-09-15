import { mkdtemp, copyFile, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'mission-browser-'));
process.env.PORT = '4311'; process.env.TASK_MANAGER_FILE = join(dir, 'project.yaml');
await copyFile('tests/e2e-project.yaml', process.env.TASK_MANAGER_FILE);
await writeFile(join(dir, 'project_c5.yaml'), (await readFile('tests/e2e-project.yaml', 'utf8')).replace('TaskManager 示例项目', 'C5 项目'));
await import('../server/index');
