# Guia de utilização

## Ordem recomendada na primeira vez

1. **Equipas**: nome e headcount orçamentado de internos e de externos (aceita frações: `2,5`). Os euros são opcionais.
2. **Consultores**: código (C001), equipa principal, perfil, senioridade e tipo.
   - Externo: fornecedor e rate diária.
   - Interno: sem rate.
   - Em mais de uma equipa: "Adicionar outra equipa" com a percentagem, ou "Repartir por todas as equipas".
3. **Projetos**: equipa, estado, prioridade, datas e HC de que o projeto precisa.
4. **Alocações**: quem está em que projeto e com que percentagem.
5. **Competências**: lista de competências e requisitos por equipa (nível mínimo e nº de pessoas).
6. **Skill matrix**: nível de cada pessoa; marca "validada" quando tens evidência.
7. **Formação**: planeia formações a partir dos gaps apontados.
8. **Objetivos**: por consultor ou por equipa, por período.
9. **Avaliações**: no fim do ciclo, classificação e resumo com evidência.

## Separadores

| Separador | Para quê |
| --- | --- |
| Resumo | KPIs, alertas, fornecedores, indicadores por equipa, projetos, alocações e cobertura de skills |
| Equipas | Headcount orçamentado por tipo e budget opcional |
| Consultores | Pessoas, tipo, fornecedor, rate, repartição por equipas, custo anual |
| Projetos | Portefólio a alto nível (sem tarefas: essas ficam com os gestores de projeto) |
| Alocações | Percentagem por consultor e projeto; filtro por projeto |
| Competências | Catálogo e requisitos por equipa |
| Skill matrix | Níveis por pessoa e competência |
| Formação | Gaps por fechar e plano de formação |
| Objetivos | Objetivos e progresso; filtro por período |
| Avaliações | Estado do ciclo do ano e avaliações registadas |
| Exportar | Prompt + dados agregados para o Claude; CSV |

## Rotina sugerida

- **Semanal**: abrir o Resumo, tratar alertas, atualizar estados de projetos e alocações.
- **Mensal**: rever headcount por tipo, contratos a expirar, custo de externos e formações em atraso; exportar para o Claude.
- **Semestral/anual**: objetivos e avaliações; rever requisitos de skills.

## Formatos

- Euros: `1.234,56` (não `1234.56`).
- Headcount: `3` ou `2,5`.
- Períodos: `2026`, `2026-H1`, `2026-H2`.

## Cuidados

- Usa códigos, nunca nomes reais.
- Depois de atualizar a app (`git pull`), vê a secção "Migração" em `MODELO-DE-DADOS.md`.
- Não há backup automático: copia `data/unit-manager.sqlite` com a app parada.
