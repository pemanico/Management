# Changelog

Do mais recente para o mais antigo.

## 2026-11-13

- Pessoas repartidas por várias equipas: equipa principal + outras equipas com percentagem; headcount e custo contam por fração; headcount orçamentado aceita decimais.
- Custo de externos calculado a 20 dias × 11 meses (mensal e anual, por equipa, fornecedor e total).
- Removido o alerta de concentração por fornecedor.
- Fornecedor obrigatório nos externos; tabela de fornecedores no Resumo.
- Headcount orçamentado separado em internos e externos; vagas e excessos por tipo.
- Removidas a rate faturada e a margem (a unidade não fatura).
- Consultores internos ou externos: só os externos têm rate; internos sem rate nem salário.
- Documentação: `CLAUDE.md`, `CHANGELOG.md` e pasta `docs/`.

## 2026-11-08

- Módulo de objetivos (por consultor ou equipa) e avaliações (classificação 1–4 decidida pelo utilizador).
- Resumo e export para o Claude só com agregados de objetivos e avaliações.

## 2026-11-06 e anteriores

- Módulo de formação ligado aos gaps da skill matrix.
- Tarefas substituídas por alocações consultor ↔ projeto; prioridade e HC por projeto.
- Budgets em euros opcionais: o budget principal é o headcount.
- Scripts compatíveis com Node 22.13–22.17.
- Versão inicial: equipas, consultores, projetos, skill matrix, export para o Claude.
