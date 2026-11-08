import { useCallback, useEffect, useState } from 'react';
import type { Allocation, Consultant, Evaluation, Objective, Project, Rating, Requirement, Skill, Summary, Team, Training } from '../shared/types.ts';
import { api, ApiError } from './api.ts';
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

const ROUTES = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'equipas', label: 'Equipas' },
  { id: 'consultores', label: 'Consultores' },
  { id: 'projetos', label: 'Projetos' },
  { id: 'alocacoes', label: 'Alocações' },
  { id: 'competencias', label: 'Competências' },
  { id: 'matriz', label: 'Skill matrix' },
  { id: 'formacao', label: 'Formação' },
  { id: 'objetivos', label: 'Objetivos' },
  { id: 'avaliacoes', label: 'Avaliações' },
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

  useEffect(() => {
    const onHash = () => setHash(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Os três pedidos são independentes: arrancam em paralelo (sem waterfall).
  const load = useCallback(async () => {
    try {
      const [summary, teams, consultants, projects, allocations, skills, ratings, requirements, trainings, objectives, evaluations] = await Promise.all([
        api.summary(),
        api.teams(),
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
        data: { summary, teams, consultants, projects, allocations, skills, ratings, requirements, trainings, objectives, evaluations },
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
                allocations={state.data.allocations}
                onChanged={saved}
              />
            )}
            {route === 'alocacoes' && (
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
            {route === 'formacao' && (
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
            )}
            {route === 'objetivos' && (
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
            )}
            {route === 'avaliacoes' && (
              <EvaluationsView
                teams={state.data.teams}
                consultants={state.data.consultants}
                objectives={state.data.objectives}
                evaluations={state.data.evaluations}
                onChanged={saved}
              />
            )}
            {route === 'exportar' && <ExportView summary={state.data.summary} />}
          </>
        )}
      </main>
      <p role="status" aria-live="polite" className="toast">
        {notice?.text ?? ''}
      </p>
    </>
  );
}
