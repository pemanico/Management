# Gestão da Unidade

App web **local e de utilizador único** para gerir uma unidade de negócio a alto nível: equipas e headcount, consultores internos e externos, fornecedores e rates, projetos e alocações, skill matrix, formação, objetivos e avaliações. Exporta um resumo agregado para análise no Claude.

## Arrancar

```bash
npm install
npm run server   # API em 127.0.0.1:3001 (SQLite em ./data/)
npm run dev      # UI em http://127.0.0.1:5173
npm test         # testes (node:test)
npm run build    # typecheck estrito + build
```

Requer Node >= 22.13 (usa `node:sqlite` nativo; os scripts já passam `--experimental-strip-types`).

Base de dados de teste separada:

- macOS/Linux: `DB_PATH=./data/teste.sqlite npm run server`
- Windows (PowerShell): `$env:DB_PATH='./data/teste.sqlite'; npm run server`

## Documentação

| Ficheiro | Para quê |
| --- | --- |
| [docs/GUIA-DE-UTILIZACAO.md](docs/GUIA-DE-UTILIZACAO.md) | Como usar cada separador, ordem de preenchimento, lista de alertas |
| [docs/MODELO-DE-DADOS.md](docs/MODELO-DE-DADOS.md) | Tabelas, regras de negócio, fórmulas e migrações |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Estrutura do código, API, decisões técnicas |
| [docs/PRIVACIDADE.md](docs/PRIVACIDADE.md) | Que dados existem, o que sai da máquina e o que nunca sai |
| [docs/AGENTES.md](docs/AGENTES.md) | Prompt mestre, os 5 agentes e como usar o export com o Claude |
| [CLAUDE.md](CLAUDE.md) | Regras para o Claude Code quando altera este repositório |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de alterações |

## Regras que não se negoceiam

- **Nunca** fazer commit de `data/` nem de dados reais: o repositório é público. Testes e exemplos usam só dados fictícios.
- Consultores identificados por código (C001), nunca por nome. A tabela código→pessoa fica fora da app.
- Classificações de avaliação são decisão humana: a app não as calcula e o Claude não as propõe.

## Por fazer

- Exportação: backup e restauro da base de dados.
- Aviso de alterações por guardar nos formulários; lint; testes de componentes.
