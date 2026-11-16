# Changelog

Do mais recente para o mais antigo.

## 2026-11-16

- Interface (fase 2): UI e mensagens do servidor em inglês; páginas com endereços em inglês (`#/teams`, `#/consultants`, …). Prompt, CSV e docs continuam em português.
- Interface nova (fase 1): menu lateral agrupado à esquerda (gaveta no telemóvel), tema claro/escuro/sistema guardado no browser, paleta verde.
- Departamentos: agrupam equipas (opcional). O manager fica ligado a um departamento, sem equipa principal, e conta em partes iguais por todas as equipas dele.
- Migração: `consultants.team_id` passa a opcional (recriação da tabela, com dados copiados). Fazer cópia da base antes de arrancar.
- Vistas montadas em paralelo: trocar de rota não perde o que estava escrito num formulário.
- Rascunhos de formulário guardados no browser (localStorage) até gravar ou apagar.
- Skill matrix mostra pessoas repartidas por outras equipas com a percentagem.
- Perfis: lista única (combo) com perfis Big Data de trainee a manager; página Perfis para criar e renomear (renomear atualiza os consultores) e apagar (só se não estiver em uso). Perfis em texto livre das bases antigas passam automaticamente para a lista.

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
