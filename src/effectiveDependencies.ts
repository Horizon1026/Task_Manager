import type { Project } from './model';

export type DependencyKind = 'explicit' | 'assignee';
export type EffectiveDependencyEdge = { from: string; to: string; kind: DependencyKind };
export type EffectiveDependencyGraph = { edges: EffectiveDependencyEdge[]; dependenciesByTask: Map<string, string[]> };

export function explicitDependencyEdges(project: Project): EffectiveDependencyEdge[] {
  return project.tasks.flatMap(task => task.dependencies.map(from => ({ from, to: task.uid, kind: 'explicit' as const })));
}

/** Combines persisted dependencies with resource-order edges produced by the scheduler. */
export function buildEffectiveDependencyGraph(project: Project, resourceEdges: EffectiveDependencyEdge[] = []): EffectiveDependencyGraph {
  const edgeByPair = new Map<string, EffectiveDependencyEdge>();
  for (const edge of explicitDependencyEdges(project)) edgeByPair.set(`${edge.from}\0${edge.to}`, edge);
  for (const edge of resourceEdges) {
    const key = `${edge.from}\0${edge.to}`;
    if (!edgeByPair.has(key)) edgeByPair.set(key, edge);
  }
  const edges = [...edgeByPair.values()];
  const dependenciesByTask = new Map(project.tasks.map(task => [task.uid, [] as string[]]));
  for (const edge of edges) dependenciesByTask.get(edge.to)?.push(edge.from);
  const byUid = new Map(project.tasks.map(task => [task.uid, task]));
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(uid: string) {
    if (visiting.has(uid)) {
      const task = byUid.get(uid);
      throw new Error(`有效依赖形成循环：${task ? `${task.order}. ${task.name}` : uid}。请检查显式依赖或资源排程。`);
    }
    if (visited.has(uid)) return;
    visiting.add(uid);
    for (const dependency of dependenciesByTask.get(uid) ?? []) visit(dependency);
    visiting.delete(uid); visited.add(uid);
  }
  for (const task of project.tasks) visit(task.uid);
  return { edges, dependenciesByTask };
}
