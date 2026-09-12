import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectStore, HttpError } from './store';
import { downloadYear } from './holidays';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4310);
const store = new ProjectStore(resolve(process.env.MISSION_FILE || resolve(root, 'data/project.yaml')));
const dev = process.argv.includes('--dev');
const vite = dev ? await (await import('vite')).createServer({ root, server: { middlewareMode: true }, appType: 'spa' }) : null;
const json = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, '需要 JSON 请求');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 5_000_000) throw new HttpError(413, '文件过大'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server = createServer(async (req, res) => {
  try {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host || '')) throw new HttpError(403, '仅允许本机访问');
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const origin = req.headers.origin;
      if (origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) throw new HttpError(403, '拒绝跨站请求');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '拒绝跨站请求');
      if (req.method === 'GET' && url.pathname === '/api/project') return json(res, 200, await store.read());
      if (req.method === 'GET' && url.pathname === '/api/backups') return json(res, 200, { backups: await store.list() });
      if (req.method === 'GET' && url.pathname === '/api/calendar') return json(res, 200, await downloadYear(Number(url.searchParams.get('year'))));
      if (req.method === 'POST' && url.pathname === '/api/save') { const data = await body(req); return json(res, 200, await store.save(data.project, data.revision)); }
      if (req.method === 'POST' && url.pathname === '/api/restore') { const data = await body(req); return json(res, 200, await store.restore(data.name, data.revision)); }
      throw new HttpError(404, '接口不存在');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '不支持的请求');
    if (vite) return vite.middlewares(req, res);
    const dist = resolve(root, 'dist');
    let path = resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(dist + sep) && path !== dist) throw new HttpError(403, '无效路径');
    if (!(await stat(path).catch(() => null))?.isFile()) path = resolve(dist, 'index.html');
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch (e) { json(res, e instanceof HttpError ? e.status : 422, { error: (e as Error).message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`MissionManager: http://127.0.0.1:${port}\n项目文件：${store.file}`));
const stop = () => { server.close(); void vite?.close(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
