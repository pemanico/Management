import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Allocation, Consultant, Department, Evaluation, Profile, Objective, Project, Rating, Requirement, Skill, Summary, Team, Training } from '../shared/types.ts';
import { api, ApiError } from './api.ts';
import { applyTheme, readTheme, THEMES, type Theme } from './theme.ts';
import { usePersistedState } from './usePersistedState.ts';
import { SummaryView } from './views/SummaryView.tsx';
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

const NAV = [
  { group: 'Dashboards', items: [{ id: 'resumo', label: 'Resumo' }] },
  {
    group: 'Pessoas',
    items: [
      { id: 'equipas', label: 'Equipas' },
      { id: 'consultores', label: 'Consultores' },
      { id: 'perfis', label: 'Perfis' },
    ],
  },
  {
    group: 'Trabalho',
    items: [
      { id: 'projetos', label: 'Projetos' },
      { id: 'alocacoes', label: 'Alocações' },
    ],
  },
  {
    group: 'Competências',
    items: [
      { id: 'competencias', label: 'Competências' },
      { id: 'matriz', label: 'Skill matrix' },
      { id: 'formacao', label: 'Formação' },
    ],
  },
  {
    group: 'Desempenho',
    items: [
      { id: 'objetivos', label: 'Objetivos' },
      { id: 'avaliacoes', label: 'Avaliações' },
    ],
  },
  { group: 'Dados', items: [{ id: 'exportar', label: 'Exportar' }] },
] as const;
const ROUTES = NAV.flatMap((g) => g.items.map((r) => ({ id: r.id, label: r.label })));
const THEME_LABEL: Record<Theme, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' };
type RouteId = (typeof NAV)[number]['items'][number]['id'];

function readHash(): { route: RouteId; params: URLSearchParams } {
  const [path = '', query = ''] = window.location.hash.replace('#/', '').split('?');
  return { route: ROUTES.find((r) => r.id === path)?.id ?? 'resumo', params: new URLSearchParams(query) };
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
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Ocorreu um erro.' });
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
    setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, text: 'Alterações guardadas.' }));
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
          <legend className="sr-only">Tema</legend>
          {THEMES.map((t) => (
            <label key={t}>
              <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => chooseTheme(t)} />
              <span>{THEME_LABEL[t]}</span>
            </label>
          ))}
        </fieldset>
      </header>
      <aside id="sidebar" className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <h1 className="brand">Gestão da Unidade</h1>
        <nav aria-label="Principal">
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
        {state.status === 'loading' && <p role="status">A carregar…</p>}
        {state.status === 'error' && (
          <div role="alert" className="error banner">
            <p>{state.message}</p>
            <button type="button" onClick={() => void load()}>Tentar novamente</button>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <Panel active={route === 'resumo'}>
              <SummaryView summary={state.data.summary} />
            </Panel>
            <Panel active={route === 'equipas'}>
              <TeamsView teams={state.data.teams} departments={state.data.departments} onChanged={saved} />
            </Panel>
            <Panel active={route === 'consultores'}>
              <ConsultantsView
                teams={state.data.teams}
                departments={state.data.departments}
                profiles={state.data.profiles}
                consultants={state.data.consultants}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'perfis'}>
              <ProfilesView profiles={state.data.profiles} onChanged={saved} />
            </Panel>
            <Panel active={route === 'projetos'}>
              <ProjectsView
                teams={state.data.teams}
                projects={state.data.projects}
                allocations={state.data.allocations}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'alocacoes'}>
              <AllocationsView
                teams={state.data.teams}
                projects={state.data.projects}
                consultants={state.data.consultants}
                allocations={state.data.allocations}
                projectFilter={params.get('projeto') ?? ''}
                onFilter={(id) => {
                  window.location.hash = id === '' ? '#/alocacoes' : `#/alocacoes?projeto=${id}`;
                }}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'competencias'}>
              <SkillsView
                teams={state.data.teams}
                skills={state.data.skills}
                ratings={state.data.ratings}
                requirements={state.data.requirements}
                coverage={state.data.summary.skills.coverage}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'matriz'}>
              <MatrixView
                teams={state.data.teams}
                consultants={state.data.consultants}
                skills={state.data.skills}
                ratings={state.data.ratings}
                requirements={state.data.requirements}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'formacao'}>
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
            <Panel active={route === 'objetivos'}>
              <ObjectivesView
                teams={state.data.teams}
                consultants={state.data.consultants}
                objectives={state.data.objectives}
                periodFilter={params.get('periodo') ?? ''}
                onFilter={(p) => {
                  window.location.hash = p === '' ? '#/objetivos' : `#/objetivos?periodo=${encodeURIComponent(p)}`;
                }}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'avaliacoes'}>
              <EvaluationsView
                teams={state.data.teams}
                consultants={state.data.consultants}
                objectives={state.data.objectives}
                evaluations={state.data.evaluations}
                onChanged={saved}
              />
            </Panel>
            <Panel active={route === 'exportar'}>
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
