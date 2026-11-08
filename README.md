# Gestão da Unidade

App local para registar equipas, budget, headcount, consultores/rates, projetos e tarefas, skill matrix, e exportar um resumo para o Claude.

## Arrancar

```bash
npm install
npm run server   # API em 127.0.0.1:3001 (SQLite em ./data/)
npm run dev      # UI em http://127.0.0.1:5173
npm test         # testes do backend
```

Requer Node >= 22.13 (`node -v` para ver). Usa `node:sqlite` nativo e o `--experimental-strip-types` já vem nos scripts, por isso não precisa de dependências de backend. Em Node < 22.13 o `node:sqlite` não existe: atualiza o Node.

Para usar uma base de dados de teste separada:

- macOS/Linux: `DB_PATH=./data/teste.sqlite npm run server`
- Windows (PowerShell): `$env:DB_PATH='./data/teste.sqlite'; npm run server`

## Decisões

- Montantes sempre em cêntimos (inteiros). Input em formato PT (`1.234,56`); `1234.56` é rejeitado por ser ambíguo.
- Consultores identificados por código (C001), nunca por nome. A tabela código→pessoa fica fora da app.
- API só escuta em localhost e rejeita Hosts não locais. Sem autenticação: é uma app de utilizador único.
- Projetos e tarefas: apagar um projeto apaga as suas tarefas (com confirmação); apagar um consultor deixa as tarefas sem responsável. O filtro por projeto fica na URL (`#/tarefas?projeto=1`).
- "Hoje" (atrasos, contratos a expirar, datas de avaliação) é o dia civil em Lisboa, não UTC (`shared/dates.ts`). Timestamps de auditoria ficam em ISO UTC.
- O budget é, antes de mais, **headcount** (`Headcount orçamentado`). Os montantes em euros (budget, gasto, budget de projetos) são opcionais: vazio = 0 = "sem budget em dinheiro". Com tudo a 0, a app esconde as colunas e os alertas de dinheiro.
- Moeda única (EUR). Sem dependências além de React/Vite/TS.

- Skill matrix: níveis 0–4; cada avaliação é *validada* (exige evidência) ou *autoavaliação*. Os requisitos são por equipa (nível mínimo + nº mínimo de pessoas). Alerta de avaliações com mais de 365 dias. O export para o Claude leva só a cobertura agregada, nunca as avaliações individuais.

## Próximos módulos

Formação (plano por gap) e objetivos & avaliações.
