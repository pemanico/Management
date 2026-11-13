# Arquitetura

## Visão geral

```
Browser (React 19 + Vite, 127.0.0.1:5173)
        │  fetch /api/*  (proxy do Vite)
        ▼
API Node http (127.0.0.1:3001, sem framework)
        ▼
SQLite (node:sqlite, ficheiro em ./data/)
```

Tudo corre na máquina do utilizador. Não há autenticação porque há um só utilizador e a API não escuta fora de localhost.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `shared/types.ts` | Tipos e constantes partilhados entre servidor e UI (incluindo dias/meses do custo de externos) |
| `shared/dates.ts` | `businessDate()`: dia civil em Europe/Lisbon |
| `server/index.ts` | Arranque: abre a base de dados e escuta em 127.0.0.1 |
| `server/db.ts` | Schema, migrações e CRUD (SQL parametrizado) |
| `server/validate.ts` | Validação de todos os pedidos (um parser por entidade) |
| `server/app.ts` | Rotas HTTP, export CSV, tratamento de erros |
| `server/summary.ts` | `buildSummary`: agregados e alertas (o que a UI mostra no Resumo e o que vai para o Claude) |
| `server/csv.ts` | CSV com proteção contra CSV injection |
| `server/app.test.ts` | Testes de API, regras, privacidade e migração |
| `src/App.tsx` | Rotas por hash, carregamento de dados em paralelo, toast de confirmação |
| `src/api.ts` | Cliente da API com mensagens de erro em PT |
| `src/money.ts` | Parse/format de euros (cêntimos) e de headcount |
| `src/prompt.ts` | Prompt mestre exportado com os dados |
| `src/views/*` | Um ficheiro por separador |
| `src/components/*` | `Field` (label + erro acessível), `ConfirmDelete` |

## API

Todas as rotas estão sob `/api`. Corpo e resposta em JSON (exceto CSV).

| Rota | Métodos | Notas |
| --- | --- | --- |
| `/summary` | GET | Agregados + alertas |
| `/export?kind=…` | GET | CSV: `teams`, `consultants`, `projects`, `allocations`, `trainings`, `ratings`, `objectives`, `evaluations` |
| `/teams`, `/consultants`, `/projects`, `/skills`, `/trainings`, `/objectives`, `/evaluations` | GET, POST; PUT e DELETE em `/:id` | CRUD por id |
| `/allocations` | GET, PUT; DELETE `/:projectId/:consultantId` | Upsert por par |
| `/ratings` | GET, PUT; DELETE `/:consultantId/:skillId` | Upsert por par |
| `/requirements` | GET, PUT; DELETE `/:teamId/:skillId` | Upsert por par |

Códigos: 400 validação, 404 não encontrado, 409 conflito (único/FK), 500 genérico sem detalhes internos.

## Decisões técnicas

- **Sem framework no backend** e **sem ORM**: menos dependências a aprovar num contexto bancário; `node:sqlite` é nativo.
- **Cêntimos inteiros** para dinheiro e **centésimos inteiros** para headcount: sem erros de vírgula flutuante.
- **Alertas calculados no servidor** (`buildSummary`), para a UI e o export verem exatamente o mesmo.
- **Migrações aditivas** em `openDb`: colunas novas com `ALTER TABLE`; colunas antigas sem uso ficam (por exemplo `bill_rate_cents_per_day`, tabela `tasks`). Uma base antiga abre sempre.
- **Rotas por hash** (`#/consultores`) com filtros na query (`#/alocacoes?projeto=1`, `#/objetivos?periodo=2026`).
- **Segurança**: só localhost, verificação do Host, `Content-Type: application/json` obrigatório, corpo ≤ 64 KB.

## Limitações conhecidas

- A base de dados não é cifrada pela app: depende da cifra do disco.
- Sem histórico de alterações (editar uma avaliação substitui a anterior).
- Sem backup/restauro integrado (por fazer).
- Sem testes de componentes nem lint.
