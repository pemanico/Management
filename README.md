# Gestão da Unidade

App local para registar equipas, budget, headcount, consultores/rates, projetos e alocações, skill matrix, formação, e exportar um resumo para o Claude.

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
- Projetos a alto nível: estado, prioridade, datas e HC de que o projeto precisa. As tarefas **não** estão na app: ficam com os gestores de projeto.
- Alocações: consultor ↔ projeto com % (100 % = 1 FTE). Só contam projetos em aberto. Alertas: consultor sem alocação (bench), sobre-alocado (> 100 %) e projeto com menos FTE do que o HC necessário. Apagar um projeto apaga as suas alocações (com confirmação). O filtro por projeto fica na URL (`#/alocacoes?projeto=1`).
- Bases de dados antigas migram sozinhas (colunas novas nos projetos). A tabela `tasks` de versões anteriores, se existir, fica por usar e não é apagada.
- "Hoje" (atrasos, contratos a expirar, datas de avaliação) é o dia civil em Lisboa, não UTC (`shared/dates.ts`). Timestamps de auditoria ficam em ISO UTC.
- O budget é, antes de mais, **headcount** (`Headcount orçamentado`). Os montantes em euros (budget, gasto, budget de projetos) são opcionais: vazio = 0 = "sem budget em dinheiro". Com tudo a 0, a app esconde as colunas e os alertas de dinheiro.
- Moeda única (EUR). Sem dependências além de React/Vite/TS.

- Skill matrix: níveis 0–4; cada avaliação é *validada* (exige evidência) ou *autoavaliação*. Os requisitos são por equipa (nível mínimo + nº mínimo de pessoas). Alerta de avaliações com mais de 365 dias. O export para o Claude leva só a cobertura agregada, nunca as avaliações individuais.
- Formação: plano por consultor e competência (tipo, nível alvo, estado, data limite, custo opcional). Liga-se aos gaps da skill matrix: uma formação **em aberto** só conta como cobertura se levar o consultor ao nível exigido (`gapAfterTraining`). Concluir uma formação **não** altera o nível na skill matrix: essa avaliação é tua, com evidência (a app avisa quando falta atualizar). O custo em euros é opcional.

- Internos e externos: cada consultor tem um tipo. Dos **internos** a app não guarda rate nem salário (o servidor descarta-os mesmo que venham no pedido). Os **externos** têm rate por dia (> 0) e fornecedor obrigatórios. Não há rate faturada nem margem: a unidade não fatura.
- Headcount orçamentado por tipo: cada equipa tem vagas de internos e de externos em separado; vagas e excessos são alertados por tipo (o total pode bater certo com a composição errada).
- Fornecedores: o resumo agrupa os externos ativos por fornecedor (ignora maiúsculas/minúsculas): peso, rate média, custo/dia e contratos a expirar em 90 dias. Alerta de concentração quando um fornecedor tem mais de 50 % dos externos (só com 4+ externos).
- Migração de bases antigas: todos os consultores passam a "externo" sem fornecedor e o headcount orçamentado passa todo para externos. Corrige em Equipas e Consultores; a app alerta os externos sem fornecedor. A coluna antiga da rate faturada fica na base de dados sem ser usada.
- Objetivos: por consultor **ou** por equipa (nunca ambos), com período (`2026`, `2026-H1`, `2026-H2`), estado, progresso e data limite. "Atingido" exige 100 %.
- Avaliações: uma por consultor e período; classificação 1–4 **atribuída por ti** (a app nunca a calcula nem sugere). Uma avaliação final exige resumo com a evidência; rascunhos não. Datas futuras são recusadas.
- Privacidade: objetivos, notas e resumos de avaliação ficam só na base de dados local. O resumo enviado ao Claude contém apenas agregados (contagens, progresso médio por equipa); há testes que garantem que não vaza texto nem classificações individuais. O prompt mestre proíbe o Claude de propor classificações. Os CSV de objetivos/avaliações são descarregamentos locais: não os colar em ferramentas externas.
- Alertas de avaliações em falta só aparecem a partir de outubro (antes disso o ciclo ainda decorre).

## Próximos módulos

A exportação (backup/restauro e formatos para o Claude).
