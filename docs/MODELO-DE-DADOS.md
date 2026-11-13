# Modelo de dados e regras de negócio

## Entidades

| Tabela | O que guarda | Chave / restrições |
| --- | --- | --- |
| `teams` | Equipa, headcount orçamentado de internos e de externos, budget e gasto em euros (opcionais) | nome único |
| `consultants` | Código, equipa principal, perfil, senioridade, tipo (interno/externo), fornecedor, rate/dia, fim de contrato, estado | código único |
| `consultant_teams` | Outras equipas de uma pessoa, com percentagem (1–99) | (consultor, equipa) |
| `projects` | Projeto por equipa: estado, prioridade, datas, HC necessário, budget opcional | (equipa, nome) único |
| `allocations` | Consultor ↔ projeto com % (1–100) | (projeto, consultor) |
| `skills` | Competências e categoria | nome único |
| `ratings` | Nível 0–4 por consultor e competência, validada ou autoavaliação, evidência, data | (consultor, competência) |
| `requirements` | Por equipa e competência: nível mínimo e nº mínimo de pessoas | (equipa, competência) |
| `trainings` | Formação por consultor e competência: nível alvo, tipo, estado, data limite, custo opcional | id |
| `objectives` | Objetivo de um consultor **ou** de uma equipa: período, estado, progresso, data limite | exatamente um dos dois |
| `evaluations` | Avaliação por consultor e período: classificação 1–4, resumo, rascunho/final, data | (consultor, período) único |

Apagar um consultor apaga as suas alocações, avaliações de skills, formações, objetivos, avaliações e repartições. Uma equipa com consultores ou projetos não pode ser apagada.

## Regras

### Internos e externos
- **Interno**: sem rate, sem salário, sem fornecedor (o servidor descarta-os).
- **Externo**: rate diária > 0 e fornecedor obrigatórios.
- Não existe rate faturada nem margem.

### Custo de externos
`custo mensal = rate diária × 20` e `custo anual = rate diária × 20 × 11` (220 dias). Sempre a 100 %, sem considerar a % de alocação a projetos. Constantes em `shared/types.ts`.

### Pessoas em várias equipas
- Cada pessoa tem uma **equipa principal** e, opcionalmente, outras equipas com percentagem. A principal fica com `100 − soma das outras` (mínimo 1 %).
- **Por equipa**, headcount e custo contam pela fração (50/50 = 0,5 em cada).
- **No total da unidade** contam pessoas inteiras.
- Skills, objetivos, alertas de contrato e alocação contam só na equipa principal.
- Apagar uma equipa "extra" devolve a fração à principal.

### Headcount
- Orçamentado por equipa e por tipo, em FTE com até 2 casas decimais (guardado em centésimos).
- Vagas e excessos são calculados **por tipo**: o total pode estar certo com a composição errada.

### Projetos e alocações
- 100 % = 1 FTE. Só contam projetos em aberto (estado diferente de concluído).
- Défice do projeto = `HC necessário × 100 − % alocada`.

### Skill matrix e formação
- Níveis: 0 sem conhecimento, 1 básico, 2 autónomo, 3 avançado, 4 referência.
- Avaliação **validada** exige evidência; a data não pode ser futura.
- Uma formação em aberto só conta como cobertura se o nível alvo chegar ao nível exigido.
- Concluir uma formação não altera o nível: é preciso atualizar a skill matrix.

### Objetivos e avaliações
- Período: `2026`, `2026-H1` ou `2026-H2`. "Atingido" exige 100 %.
- Avaliação final exige resumo com a evidência; a classificação é sempre decidida pelo utilizador.

### Datas e montantes
- "Hoje" = dia civil em Lisboa. Montantes em cêntimos inteiros. Euros são opcionais (0 = sem budget em dinheiro).

## Alertas

| Tipo | Quando dispara |
| --- | --- |
| `vacancies` / `over_headcount` | Headcount ativo abaixo / acima do orçamentado, por tipo e equipa |
| `missing_cost_rate` / `missing_supplier` | Externo sem rate / sem fornecedor (dados migrados) |
| `contract_expiring` | Contrato termina nos próximos 90 dias |
| `stale_data` | Equipa ou consultor sem atualização há mais de 30 dias |
| `budget_over_90` / `projects_exceed_budget` | Só com budget em euros: consumo ≥ 90 % / projetos acima do budget da equipa |
| `project_at_risk` / `project_overdue` / `project_understaffed` | Projeto em risco / fora de prazo / com menos FTE do que precisa |
| `consultant_unallocated` / `consultant_overallocated` | Ativo com 0 % / mais de 100 % alocado |
| `skill_gap` / `skill_unvalidated` / `skill_assessment_old` | Faltam pessoas com o nível exigido / cobertura só com autoavaliações / avaliações com mais de 365 dias |
| `training_overdue` / `training_gap_uncovered` | Formação fora de prazo / gap sem formação que o feche |
| `objective_at_risk` / `objective_overdue` / `consultant_without_objectives` | Objetivos em risco / fora de prazo / consultor sem objetivos no ano |
| `evaluation_pending` | Consultor sem avaliação final do ano (só a partir de outubro) |

## Migração de bases antigas

Feita automaticamente ao abrir a base:

- Projetos ganham prioridade (`medium`) e HC necessário (0).
- Todos os consultores passam a **externo**, sem fornecedor.
- O headcount orçamentado antigo passa todo para **externos**.
- A rate faturada e a tabela `tasks` ficam na base sem serem usadas.

Depois de atualizar, corrige em Equipas (repartição interno/externo) e em Consultores (tipo e fornecedor).
