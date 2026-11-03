import { useSyncExternalStore } from "react";
import { kv, requestPersistence } from "./db";
import type { AuditEvent, Library, Project, Revision } from "./model";
import { migrateLibrary, migrateProject, seedLibrary } from "./seed";
import { DomainError, now } from "./util";

interface State {
  ready: boolean;
  library: Library;
  projects: Record<string, Project>;
}

let state: State = { ready: false, library: seedLibrary(), projects: {} };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  emit();
};

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}
export const getState = () => state;

export async function init() {
  const stored = await kv.get<Library>("library");
  const lib = stored ? migrateLibrary(stored) : seedLibrary();
  if (stored && lib !== stored) await kv.set("library", lib);
  const keys = (await kv.keys()).map(String).filter((k) => k.startsWith("project:"));
  const projects: Record<string, Project> = {};
  for (const k of keys) {
    const raw = await kv.get<Project>(k);
    if (!raw) continue;
    const p = migrateProject(raw);
    if (p !== raw) await kv.set(k, p);
    projects[p.id] = p;
  }
  set({ ready: true, library: lib, projects });
  void requestPersistence();
}

export async function updateLibrary(fn: (l: Library) => void) {
  const draft = structuredClone(state.library);
  fn(draft);
  await kv.set("library", draft);
  set({ library: draft });
}

export async function putProject(p: Project) {
  await kv.set(`project:${p.id}`, p);
  set({ projects: { ...state.projects, [p.id]: p } });
}

/**
 * Applies a change to a copy of the project; if the change throws, nothing is saved.
 * Every successful change is written to the device immediately (no unsaved state).
 */
export async function mutate(projectId: string, fn: (p: Project, lib: Library) => string | void, event = "edit") {
  const cur = state.projects[projectId];
  if (!cur) throw new DomainError("NOT_FOUND", "Project not found.");
  const draft = structuredClone(cur);
  const summary = fn(draft, state.library);
  draft.updated_at = now();
  const ev: AuditEvent = { at: draft.updated_at, event, summary: summary || event };
  draft.audit = [ev, ...draft.audit].slice(0, 500);
  await putProject(draft);
  return summary;
}

export async function deleteProject(projectId: string) {
  await kv.del(`project:${projectId}`);
  await kv.del(`revisions:${projectId}`);
  const rest = { ...state.projects };
  delete rest[projectId];
  set({ projects: rest });
}

export async function getRevisions(projectId: string): Promise<Revision[]> {
  return (await kv.get<Revision[]>(`revisions:${projectId}`)) ?? [];
}
export async function putRevisions(projectId: string, revs: Revision[]) {
  await kv.set(`revisions:${projectId}`, revs);
}

/** Wipes everything on this device (used by "Reset app" in settings). */
export async function resetAll() {
  for (const k of await kv.keys()) await kv.del(String(k));
  set({ library: seedLibrary(), projects: {} });
}
