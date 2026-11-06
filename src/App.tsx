import { useCallback, useEffect, useState } from 'react';
import type { Consultant, Project, Rating, Requirement, Skill, Summary, Task, Team } from '../shared/types.ts';
import { api, ApiError } from './api.ts';
import { SummaryView } from './views/SummaryView.tsx';
import { TeamsView } from './views/TeamsView.tsx';
import { ConsultantsView } from './views/ConsultantsView.tsx';
import { ExportView } from './views/ExportView.tsx';
import { ProjectsView } from './views/ProjectsView.tsx';
import { TasksView } from './views/TasksView.tsx';
import { SkillsView } from './views/SkillsView.tsx';
import { MatrixView } from './views/MatrixView.tsx';

const ROUTES = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'equipas', label: 'Equipas' },
  { id: 'consultores', label: 'Consultores' },
  { id: 'projetos', label: 'Projetos' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'competencias', label: 'Competências' },
  { id: 'matriz', label: 'Skill matrix' },
  { id: 'exportar', label: 'Exportar' },
] as const;
type RouteId = (typeof ROUTES)[number]['id'];

function readHash(): { route: RouteId; params: URLSearchParams } {
  const [path = '', query = ''] = window.location.hash.replace('#/', '').split('?');
  return { route: ROUTES.find((r) => r.id === path)?.id ?? 'resumo', params: new URLSearchParams(query) };
}

type Data = {
  summary: Summary;
  teams: Team[];
  consultants: Consultant[];
  projects: Project[];
  tasks: Task[];
  skills: Skill[];
  ratings: Rating[];
  requirements: Requirement[];
};
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Data };

export function App() {
  const [hash, setHash] = useState(readHash);
  const { route, params } = hash;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const onHash = () => setHash(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Os três pedidos são independentes: arrancam em paralelo (sem waterfall).
  const load = useCallback(async () => {
    try {
      const [summary, teams, consultants, projects, tasks, skills, ratings, requirements] = await Promise.all([
        api.summary(),
        api.teams(),
        api.consultants(),
        api.projects(),
        api.tasks(),
        api.skills(),
        api.ratings(),
        api.requirements(),
      ]);
      setState({
        status: 'ready',
        data: { summary, teams, consultants, projects, tasks, skills, ratings, requirements },
      });
    } catch (err) {
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Ocorreu um erro.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (notice === '') return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  // Chamado pelas vistas depois de gravar/apagar: recarrega e confirma ao utilizador.
  const saved = useCallback(async () => {
    await load();
    setNotice('Alterações guardadas.');
  }, [load]);

  return (
    <>
      <header className="app-header">
        <h1>Gestão da Unidade</h1>
        <nav aria-label="Principal">
          <ul>
            {ROUTES.map((r) => (
              <li key={r.id}>
                <a href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        {state.status === 'loading' && <p role="status">A carregar…</p>}
        {state.status === 'error' && (
          <div role="alert" className="error banner">
            <p>{state.message}</p>
            <button type="button" onClick={() => void load()}>Tentar novamente</button>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            {route === 'resumo' && <SummaryView summary={state.data.summary} />}
            {route === 'equipas' && <TeamsView teams={state.data.teams} onChanged={saved} />}
            {route === 'consultores' && (
              <ConsultantsView teams={state.data.teams} consultants={state.data.consultants} onChanged={saved} />
            )}
            {route === 'projetos' && (
              <ProjectsView
                teams={state.data.teams}
                projects={state.data.projects}
                tasks={state.data.tasks}
                onChanged={saved}
              />
            )}
            {route === 'tarefas' && (
              <TasksView
                projects={state.data.projects}
                consultants={state.data.consultants}
                tasks={state.data.tasks}
                projectFilter={params.get('projeto') ?? ''}
                onFilter={(id) => {
                  window.location.hash = id === '' ? '#/tarefas' : `#/tarefas?projeto=${id}`;
                }}
                onChanged={saved}
              />
            )}
            {route === 'competencias' && (
              <SkillsView
                teams={state.data.teams}
                skills={state.data.skills}
                ratings={state.data.ratings}
                requirements={state.data.requirements}
                coverage={state.data.summary.skills.coverage}
                onChanged={saved}
              />
            )}
            {route === 'matriz' && (
              <MatrixView
                teams={state.data.teams}
                consultants={state.data.consultants}
                skills={state.data.skills}
                ratings={state.data.ratings}
                requirements={state.data.requirements}
                onChanged={saved}
              />
            )}
            {route === 'exportar' && <ExportView summary={state.data.summary} />}
          </>
        )}
      </main>
      <p role="status" aria-live="polite" className="toast">
        {notice}
      </p>
    </>
  );
}
