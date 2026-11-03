import { useStore } from "./lib/store";
import { useRoute } from "./lib/router";
import { Setup } from "./screens/Setup";
import { Projects } from "./screens/Projects";
import { NewProject } from "./screens/NewProject";
import { ProjectShell } from "./screens/ProjectShell";
import { Overview } from "./screens/Overview";
import { Definition } from "./screens/Definition";
import { More } from "./screens/More";
import { AppSettings } from "./screens/AppSettings";
import { screens } from "./screens/registry";

function TopBar() {
  return (
    <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-ink text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
        <a href="#/" className="flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded bg-blue-600 text-xs font-bold">5H</span>5H13 Plans</a>
        <nav className="flex gap-4 text-sm text-slate-600"><a href="#/library">Library</a><a href="#/settings">Settings</a></nav>
      </div>
    </header>
  );
}

export function App() {
  const ready = useStore((s) => s.ready);
  const settings = useStore((s) => s.library.settings);
  const projects = useStore((s) => s.projects);
  const route = useRoute();
  if (!ready) return <p className="p-6 text-center text-slate-500">Loading…</p>;
  if (!settings) return <Setup />;
  const [head, id, tab = "", ...rest] = route;
  if (head === "p" && id) {
    const p = projects[id];
    if (!p) return <div className="p-6 text-center"><p>Project not found on this device.</p><a className="text-blue-700" href="#/">All projects</a></div>;
    const Screen = tab === "" ? Overview : tab === "definition" ? Definition : tab === "more" ? More : screens[tab];
    return (
      <ProjectShell p={p} tab={tab}>
        {Screen ? <Screen p={p} params={rest} /> : <p className="text-sm text-slate-500">Not found.</p>}
      </ProjectShell>
    );
  }
  const page = head === "new" ? <NewProject /> : head === "settings" ? <AppSettings /> : head && screens[`app:${head}`] ? (() => { const S = screens[`app:${head}`]; return <S params={route.slice(1)} />; })() : <Projects />;
  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="mx-auto max-w-3xl">{page}</div>
    </div>
  );
}
