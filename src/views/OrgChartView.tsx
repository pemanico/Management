import type { Consultant, Department, Team } from '../../shared/types.ts';
import { Field } from '../components/Field.tsx';

// Organigrama: unidade → departamentos → equipas → pessoas. O nível escolhido decide até onde se desenha.
// Só usa dados locais (não vai nada daqui para o Claude).

export const ORG_LEVELS = ['departments', 'teams', 'people'] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];
const LEVEL_LABEL: Record<OrgLevel, string> = {
  departments: 'Departments',
  teams: 'Departments and teams',
  people: 'Departments, teams and people',
};

type Props = {
  teams: Team[];
  departments: Department[];
  consultants: Consultant[];
  level: OrgLevel;
  onLevel: (level: OrgLevel) => void;
};

function People({ people }: { people: Consultant[] }) {
  if (people.length === 0) return null;
  return (
    <ul className="org-people">
      {people.map((c) => (
        <li key={c.id}>
          <strong>{c.code}</strong> {c.profile}
          {c.extraTeams.length > 0 && <span className="muted-text"> (shared)</span>}
        </li>
      ))}
    </ul>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function OrgChartView({ teams, departments, consultants, level, onLevel }: Props) {
  const active = consultants.filter((c) => c.status === 'active');
  const membersOf = (teamId: number) => active.filter((c) => c.teamId === teamId);
  const leadsOf = (departmentId: number) => active.filter((c) => c.departmentId === departmentId);
  const teamsOf = (departmentId: number | null) => teams.filter((t) => t.departmentId === departmentId);
  const showTeams = level !== 'departments';
  const showPeople = level === 'people';

  // Equipas sem departamento aparecem num grupo próprio, para não desaparecerem do desenho.
  const groups: { key: string; name: string; departmentId: number | null }[] = [
    ...departments.map((d) => ({ key: `d${d.id}`, name: d.name, departmentId: d.id as number | null })),
    ...(teamsOf(null).length > 0 ? [{ key: 'none', name: 'No department', departmentId: null }] : []),
  ];

  return (
    <section aria-labelledby="org-title">
      <h2 id="org-title">Org chart</h2>
      <div className="card form-grid">
        <Field label="Level of detail" hint="How far down the chart is drawn.">
          {(c) => (
            <select {...c} name="level" value={level} onChange={(e) => onLevel(e.target.value as OrgLevel)}>
              {ORG_LEVELS.map((l) => (
                <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {groups.length === 0 ? (
        <p className="empty">Nothing to draw yet. Add departments and teams on the Teams page.</p>
      ) : (
        <div className="org-wrap">
          <div className="org">
            <ul>
              <li>
                <div className="org-box org-root">
                  <strong>Unit</strong>
                  <span>{plural(active.length, 'person', 'people')}</span>
                </div>
                <ul>
                  {groups.map((g) => {
                    const gTeams = teamsOf(g.departmentId);
                    const leads = g.departmentId === null ? [] : leadsOf(g.departmentId);
                    const people = leads.length + gTeams.reduce((a, t) => a + membersOf(t.id).length, 0);
                    return (
                      <li key={g.key}>
                        <div className={g.departmentId === null ? 'org-box org-none' : 'org-box org-dept'}>
                          <strong>{g.name}</strong>
                          <span>{plural(gTeams.length, 'team', 'teams')} · {plural(people, 'person', 'people')}</span>
                          {showPeople && <People people={leads} />}
                        </div>
                        {showTeams && gTeams.length > 0 && (
                          <ul>
                            {gTeams.map((t) => {
                              const members = membersOf(t.id);
                              return (
                                <li key={t.id}>
                                  <div className="org-box">
                                    <strong>{t.name}</strong>
                                    <span>{plural(members.length, 'person', 'people')}</span>
                                    {showPeople && <People people={members} />}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            </ul>
          </div>
        </div>
      )}
      <p className="muted-text">
        Active people only, shown in their main team; a department's own people (the manager) sit in the department box.
      </p>
    </section>
  );
}
