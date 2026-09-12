import { mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'mission-browser-'));
process.env.PORT = '4311'; process.env.MISSION_FILE = join(dir, 'project.yaml');
await copyFile('tests/e2e-project.yaml', process.env.MISSION_FILE);
await import('../server/index');
