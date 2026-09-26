import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, type Snapshot } from './api';
import { validateProject, type Project } from './model';

type Options = {
  focusUid: string | null;
  notify: (message: string) => void;
  onAccept: (snapshot: Snapshot, initial: boolean) => void;
  onExternalRefresh: () => void;
};

type ProjectSession = {
  snapshot: Snapshot | null;
  project: Project | null;
  setProject: Dispatch<SetStateAction<Project | null>>;
  projectFiles: string[];
  backups: string[];
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  fileError: string;
  save: () => Promise<void>;
  reload: () => Promise<boolean>;
  openBackups: () => Promise<boolean>;
  selectProjectFile: (name: string) => Promise<boolean>;
  restore: (name: string) => Promise<boolean>;
};

/** Owns the YAML snapshot, external-file polling and revision-checked writes. */
export function useProjectSession({ focusUid, notify, onAccept, onExternalRefresh }: Options): ProjectSession {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [backups, setBackups] = useState<string[]>([]);
  const [fileError, setFileError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = !!snapshot && !!project && JSON.stringify(snapshot.project) !== JSON.stringify(project);
  const live = useRef({ snapshot, project, dirty, saving, focusUid });
  live.current = { snapshot, project, dirty, saving, focusUid };
  const callbacks = useRef({ notify, onAccept, onExternalRefresh });
  callbacks.current = { notify, onAccept, onExternalRefresh };

  const accept = useCallback((value: Snapshot, initial = false) => {
    setSnapshot(value);
    setProject(value.project);
    setConflict(false);
    setFileError('');
    callbacks.current.onAccept(value, initial);
  }, []);

  useEffect(() => {
    let cancelled = false, running = false;
    async function poll() {
      if (running || live.current.saving) return;
      running = true;
      const requestRevision = live.current.snapshot?.revision;
      try {
        const value = await api<Snapshot>('project');
        if (cancelled || live.current.saving || live.current.snapshot?.revision !== requestRevision) return;
        setFileError('');
        if (!live.current.snapshot) accept(value, true);
        else if (value.revision !== live.current.snapshot.revision) {
          if (live.current.dirty) setConflict(true);
          else { accept(value); callbacks.current.onExternalRefresh(); }
        } else setConflict(false);
      } catch (error) { if (!cancelled) setFileError((error as Error).message); }
      finally { running = false; }
    }
    void poll();
    const timer = setInterval(poll, 1200);
    return () => { cancelled = true; clearInterval(timer); };
  }, [accept]);
  useEffect(() => { void api<{ projects: string[] }>('projects').then(data => setProjectFiles(data.projects)).catch(() => undefined); }, []);

  const save = useCallback(async () => {
    const current = live.current;
    if (!current.project || !current.snapshot || current.saving || current.focusUid) return;
    setSaving(true); live.current.saving = true;
    try {
      validateProject(current.project);
      const result = await api<Snapshot>('save', { project: current.project, revision: current.snapshot.revision });
      accept(result);
      callbacks.current.notify(result.warning || `已保存并备份 · ${result.backup}`);
    } catch (error) { callbacks.current.notify((error as Error).message); }
    finally { setSaving(false); live.current.saving = false; }
  }, [accept]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (live.current.focusUid) return;
      (document.activeElement as HTMLElement)?.blur();
      setTimeout(() => void save(), 0);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (live.current.dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', unload); };
  }, [save]);

  async function reload() {
    if (live.current.dirty && !confirm('重新加载会丢弃当前未保存的修改。是否继续？')) return false;
    try { accept(await api<Snapshot>('project'), true); return true; }
    catch (error) { callbacks.current.notify((error as Error).message); return false; }
  }
  async function openBackups() {
    try {
      const data = await api<{ backups: string[] }>('backups');
      setBackups(data.backups);
      return true;
    } catch (error) { callbacks.current.notify((error as Error).message); return false; }
  }
  async function selectProjectFile(name: string) {
    const current = live.current;
    if (!current.snapshot || name === current.snapshot.file.split('/').pop()) return false;
    if (current.dirty && !confirm('切换项目会丢弃当前未保存的修改。是否继续？')) return false;
    try { accept(await api<Snapshot>('projects/select', { name }), true); return true; }
    catch (error) { callbacks.current.notify((error as Error).message); return false; }
  }
  async function restore(name: string) {
    const current = live.current;
    if (!current.snapshot || !confirm(`${current.dirty ? '当前未保存修改将被丢弃。' : ''}恢复选中的备份？恢复前会自动备份当前磁盘文件。`)) return false;
    setSaving(true); live.current.saving = true;
    try {
      accept(await api<Snapshot>('restore', { name, revision: current.snapshot.revision }), true);
      return true;
    } catch (error) { callbacks.current.notify((error as Error).message); return false; }
    finally { setSaving(false); live.current.saving = false; }
  }
  return { snapshot, project, setProject, projectFiles, backups, dirty, saving, conflict, fileError, save, reload, openBackups, selectProjectFile, restore };
}
