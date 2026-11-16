import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Allocation, Consultant, Department, Evaluation, Profile, Objective, Project, Rating, Requirement, Skill, Summary, Team, Training } from '../shared/types.ts';
import { api, ApiError } from './api.ts';
import { applyTheme, readTheme, THEMES, type Theme } from './theme.ts';
import { usePersistedState } from './usePersistedState.ts';
import { CoverageDashboard, HeadcountDashboard, OverviewDashboard, StaffingDashboard } from './views/SummaryView.tsx';
import { TeamsView } from './views/TeamsView.tsx';
import { ConsultantsView } from './views/ConsultantsView.tsx';
import { ExportView } from './views/ExportView.tsx';
import { ProjectsView } from './views/ProjectsView.tsx';
import { AllocationsView } from './views/AllocationsView.tsx';
import { SkillsView } from './views/SkillsView.tsx';
import { MatrixView } from './views/MatrixView.tsx';
import { TrainingView } from './views/TrainingView.tsx';
import { ObjectivesView } from './views/ObjectivesView.tsx';
import { EvaluationsView } from './views/EvaluationsView.tsx';
import { ProfilesView } from './views/ProfilesView.tsx';
import { ORG_LEVELS, OrgChartView, type OrgLevel } from './views/OrgChartView.tsx';

const NAV = [
  {
    group: 'Dashboards',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'headcount', label: 'Headcount & cost' },
      { id: 'staffing', label: 'Projects & allocations' },
      { id: 'coverage', label: 'Skills & training' },
    ],
  },
  {
    group: 'People',
    items: [
      { id: 'teams', label: 'Teams' },
      { id: 'consultants', label: 'Consultants' },
      { id: 'profiles', label: 'Profiles' },
      { id: 'org', label: 'Org chart' },
    ],
  },
  {
    group: 'Work',
    items: [
      { id: 'projects', label: 'Projects' },
      { id: 'allocations', label: 'Allocations' },
    ],
  },
  {
    group: 'Skills',
    items: [
      { id: 'skills', label: 'Skills' },
      { id: 'matrix', label: 'Skill matrix' },
      { id: 'training', label: 'Training' },
    ],
  },
  {
    group: 'Performance',
    items: [
      { id: 'objectives', label: 'Objectives' },
      { id: 'evaluations', label: 'Evaluations' },
    ],
  },
  { group: 'Date', items: [{ id: 'export', label: 'Export' }] },
] as const;
const ROUTES = NAV.flatMap((g) => g.items.map((r) => ({ id: r.id, label: r.label })));
const THEME_LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
type RouteId = (typeof NAV)[number]['items'][number]['id'];

function readHash(): { route: RouteId; params: URLSearchParams } {
  const [path = '', query = ''] = window.location.hash.replace('#/', '').split('?');
  return { route: ROUTES.find((r) => r.id === path)?.id ?? 'overview', params: new URLSearchParams(query) };
}

// As vistas ficam montadas e só se escondem: trocar de rota não perde o estado dos formulários.
function Panel({ active, children }: { active: boolean; children: ReactNode }) {
  return <div hidden={!active}>{children}</div>;
}

type Data = {
  summary: Summary;
  teams: Team[];
  departments: Department[];
  profiles: Profile[];
  consultants: Consultant[];
  projects: Project[];
  allocations: Allocation[];
  skills: Skill[];
  ratings: Rating[];
  requirements: Requirement[];
  trainings: Training[];
  objectives: Objective[];
  evaluations: Evaluation[];
};
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Data };

export function App() {
  const [hash, setHash] = useState(readHash);
  const { route, params } = hash;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);

  // Grupos do menu abertos pelo utilizador (fica guardado no browser). Por omissão estão todos fechados.
  const [openGroups, setOpenGroups] = usePersistedState<string[]>('gu:nav:open', []);
  const toggleGroup = (group: string) =>
    setOpenGroups((o) => (o.includes(group) ? o.filter((x) => x !== group) : [...o, group]));

  function chooseTheme(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  useEffect(() => {
    const onHash = () => {
      setHash(readHash());
      setMenuOpen(false); // no telemóvel, escolher uma página fecha o menu
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Os três pedidos são independentes: arrancam em paralelo (sem waterfall).
  const load = useCallback(async () => {
    try {
      const [summary, teams, departments, profiles, consultants, projects, allocations, skills, ratings, requirements, trainings, objectives, evaluations] = await Promise.all([
        api.summary(),
        api.teams(),
        api.departments(),
        api.profiles(),
        api.consultants(),
        api.projects(),
        api.allocations(),
        api.skills(),
        api.ratings(),
        api.requirements(),
        api.trainings(),
        api.objectives(),
        api.evaluations(),
      ]);
      setState({
        status: 'ready',
        data: { summary, teams, departments, profiles, consultants, projects, allocations, skills, ratings, requirements, trainings, objectives, evaluations },
      });
    } catch (err) {
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (notice === null) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  // Chamado pelas vistas depois de gravar/apagar: recarrega e confirma ao utilizador.
  const saved = useCallback(async () => {
    await load();
    // Objeto novo a cada gravação: reinicia o temporizador e volta a anunciar mesmo com o mesmo texto.
    setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, text: 'Changes saved.' }));
  }, [load]);

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Menu
        </button>
        <span className="topbar-title">{ROUTES.find((r) => r.id === route)?.label}</span>
        <fieldset className="theme-switch">
          <legend className="sr-only">Theme</legend>
          {THEMES.map((t) => (
            <label key={t}>
              <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => chooseTheme(t)} />
              <span>{THEME_LABEL[t]}</span>
            </label>
          ))}
        </fieldset>
      </header>
      <aside id="sidebar" className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <h1 className="brand">Unit Management</h1>
        <nav aria-label="Main">
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <h2>
                <button
                  type="button"
                  id={`nav-${g.group}`}
                  aria-expanded={openGroups.includes(g.group)}
                  aria-controls={`nav-list-${g.group}`}
                  onClick={() => toggleGroup(g.group)}
                >
                  {g.group}
                </button>
              </h2>
              <ul id={`nav-list-${g.group}`} aria-labelledby={`nav-${g.group}`} hidden={!openGroups.includes(g.group)}>
                {g.items.map((r) => (
                  <li key={r.id}>
                    <a href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
                      {r.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <main className="content">
        {state.status === 'loading' && <p role="status">Loading…</p>}
        {state.status === 'error' && (
          <div role="alert" className="error banner">
            <p>{state.message}</p>
            <button type="button" onClick={() => void load()}>Try again</button>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <Panel active={route === 'overview'}>
              <OverviewDashboard summary={state.data.summary} />
            </Panel>
            <Panel active={route === 'headcount'}>
              <HeadcountDashboard summary={state.data.summary} />
            </Panel>
            <Panel active={route === 'staffing'}>
              <StaffingDashboard summary={state.data.summary} />
            </Panel>
            <Panel active={route === 'coverage'}>
              <CoverageDashboard summary={state.data.summary} />
            </Panel>
            <Panel active={route === 'teams'}>
              <TeamsView teams={state.data.teams} departments={state.data.departments} onChanged={saved} />
            </Panel>
            <Panel active={route === 'consultants'}>
              <ConsultantsView
                teams={state.data.teams}
                departments={state.data.departments}
                profiles={state.data.profiles}
                consultants={state.data.consultants}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'profiles'}>
              <ProfilesView profiles={state.data.profiles} onChanged={saved} />
            </Panel>
            <Panel active={route === 'org'}>
              <OrgChartView
                teams={state.data.teams}
                departments={state.data.departments}
                consultants={state.data.consultants}
                level={ORG_LEVELS.find((l) => l === params.get('level')) ?? ('teams' as OrgLevel)}
                onLevel={(l) => {
                  window.location.hash = `#/org?level=${l}`;
                }}
              />
            </Panel>
            <Panel active={route === 'projects'}>
              <ProjectsView
                teams={state.data.teams}
                projects={state.data.projects}
                allocations={state.data.allocations}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'allocations'}>
              <AllocationsView
                teams={state.data.teams}
                projects={state.data.projects}
                consultants={state.data.consultants}
                allocations={state.data.allocations}
                projectFilter={params.get('project') ?? ''}
                onFilter={(id) => {
                  window.location.hash = id === '' ? '#/allocations' : `#/allocations?project=${id}`;
                }}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'skills'}>
              <SkillsView
                teams={state.data.teams}
                skills={state.data.skills}
                ratings={state.data.ratings}
                requirements={state.data.requirements}
                coverage={state.data.summary.skills.coverage}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'matrix'}>
              <MatrixView
                teams={state.data.teams}
                consultants={state.data.consultants}
                skills={state.data.skills}
                ratings={state.data.ratings}
                requirements={state.data.requirements}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'training'}>
              <TrainingView
                teams={state.data.teams}
                consultants={state.data.consultants}
                skills={state.data.skills}
                ratings={state.data.ratings}
                requirements={state.data.requirements}
                trainings={state.data.trainings}
                coverage={state.data.summary.skills.coverage}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'objectives'}>
              <ObjectivesView
                teams={state.data.teams}
                consultants={state.data.consultants}
                objectives={state.data.objectives}
                periodFilter={params.get('period') ?? ''}
                onFilter={(p) => {
                  window.location.hash = p === '' ? '#/objectives' : `#/objectives?period=${encodeURIComponent(p)}`;
                }}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'evaluations'}>
              <EvaluationsView
                teams={state.data.teams}
                consultants={state.data.consultants}
                objectives={state.data.objectives}
                evaluations={state.data.evaluations}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'export'}>
              <ExportView summary={state.data.summary} />
            </Panel>
          </>
        )}
      </main>
      <p role="status" aria-live="polite" className="toast">
        {notice?.text ?? ''}
      </p>
    </>
  );
}
