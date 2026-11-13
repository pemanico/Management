# CLAUDE.md

Instruções para o Claude Code neste repositório. Lê também `docs/ARQUITETURA.md` e `docs/MODELO-DE-DADOS.md` antes de mexer em lógica de negócio.

## O que é

App local, de um só utilizador, para gerir uma unidade de negócio (ver `README.md`). Corre na máquina do utilizador, num contexto bancário. O repositório é **público**.

## Comandos

```bash
npm run server      # API (127.0.0.1:3001)
npm run dev         # UI (Vite, 127.0.0.1:5173)
npm test            # node:test: server/*.test.ts e src/*.test.ts
npm run build       # tsc --noEmit (estrito) + vite build
```

Node >= 22.13. Os ficheiros `.ts` correm diretamente com `--experimental-strip-types`: só sintaxe apagável (sem `enum`, sem `namespace`, sem parameter properties) e imports com extensão `.ts`.

## Regras obrigatórias

1. **Dados**: nunca criar, ler para commit, nem fazer commit de `data/`, `*.sqlite` ou dados reais. Exemplos e testes só com dados fictícios (C001, "Equipa A", "Fornecedor A").
2. **Dinheiro**: sempre cêntimos inteiros; nunca floats para montantes. Input em formato PT (`1.234,56`); `1234.56` é rejeitado.
3. **Headcount**: guardado em centésimos de FTE inteiros; na API sai como número com no máximo 2 casas. Somar sempre em centésimos.
4. **Datas**: "hoje" é o dia civil em Europe/Lisbon (`shared/dates.ts` → `businessDate`). Timestamps de auditoria em ISO UTC.
5. **Privacidade**: nada de individual em `buildSummary` (é o que vai para o Claude): sem títulos de objetivos, notas, resumos de avaliação ou evidências. Há testes que o verificam; qualquer campo novo no resumo tem de ser agregado.
6. **Avaliações**: a app nunca calcula nem sugere classificações de pessoas. Não acrescentar "scores" automáticos.
7. **Internos**: não guardar rate nem salário de internos; o servidor descarta-os.
8. **Dependências**: não acrescentar dependências sem o utilizador aprovar. Runtime: só React. Backend sem framework.
9. **Segurança da API**: só `127.0.0.1`, verificação do header Host, JSON obrigatório, corpo ≤ 64 KB, mensagens de erro 500 genéricas. Não relaxar.
10. **CSV**: usar `toCsv`/`csvCell` (proteção contra CSV injection, separador `;`).
11. **UI**: português europeu; acessibilidade (labels ligadas, `aria-live`, foco no erro, sem diálogos nativos); estados de loading/erro/vazio; filtros refletidos na URL.

## Como acrescentar uma entidade ou campo

1. `shared/types.ts`: tipos e constantes.
2. `server/db.ts`: schema + **migração** (`PRAGMA table_info` → `ALTER TABLE`) para bases existentes; nunca partir uma base antiga.
3. `server/validate.ts`: parser que valida tudo o que vem do cliente.
4. `server/app.ts`: rotas e, se fizer sentido, export CSV.
5. `server/summary.ts`: agregados e alertas (só agregados).
6. `server/app.test.ts`: testes de validação, agregados e migração.
7. `src/api.ts`, vista em `src/views/`, rota em `src/App.tsx`.
8. `src/prompt.ts`: explicar os campos novos ao Claude.
9. `docs/` e `CHANGELOG.md`.

## Verificação antes de fazer commit

- `npm test` a passar e `npm run build` sem erros de tipos.
- Testar o fluxo no browser com uma base de teste (`DB_PATH`).
- Commits pequenos, mensagem a dizer o quê e porquê.
