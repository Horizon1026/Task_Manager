import { parseDocument } from 'yaml';
import { taskDefaultsSchema } from '../src/model';

export function parseTaskDefaults(content: string) {
  const document = parseDocument(content, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('\n'));
  const parsed = taskDefaultsSchema.safeParse(document.toJS({ maxAliasCount: 50 }));
  if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  return parsed.data;
}
