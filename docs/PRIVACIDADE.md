# Privacidade e segurança dos dados

## Princípios

1. Os dados ficam na máquina do utilizador (`./data/`, fora do git).
2. As pessoas são identificadas por código; a correspondência código→pessoa não está na app.
3. Para fora da máquina (Claude) só saem agregados e apenas por ação explícita ("Copiar prompt + dados").
4. Decisões sobre pessoas (avaliações, contratações, cessações) são sempre humanas.

## O que existe e o que sai

| Dado | Fica local | Vai no export para o Claude |
| --- | --- | --- |
| Equipas, headcount, budget | Sim | Sim (agregado por equipa) |
| Códigos de consultores | Sim | Sim, só na lista de alocações (código, equipa, % alocada) |
| Rates individuais | Sim | Não; só médias e custos por equipa e por fornecedor |
| Fornecedores | Sim | Sim: nome, nº de externos, rate média, custo, contratos a expirar |
| Salários ou custos de internos | **Não existem na app** | Não |
| Níveis de skill individuais e evidências | Sim | Não; só cobertura por equipa e competência |
| Formações individuais | Sim | Não; só contagens e custo em aberto |
| Texto dos objetivos | Sim | Não; só contagens e progresso médio |
| Classificações e resumos de avaliação | Sim | Não; só contagens (finais, rascunhos, em falta) |

Os testes em `server/app.test.ts` verificam que textos e classificações individuais não aparecem no resumo.

## Pontos de atenção

- **Equipas pequenas**: com 1 ou 2 externos numa equipa ou fornecedor, a "média" revela a rate individual. Avalia antes de exportar.
- **Nomes de fornecedores e condições comerciais** vão no export. Se a política interna não o permitir, usa códigos (F01) no campo Fornecedor.
- **CSV de objetivos, avaliações e skill matrix** contêm dados individuais: são para uso local e não devem ser colados em ferramentas externas.
- **Base de dados não cifrada pela app**: depende da cifra do disco (por exemplo BitLocker).
- **Resumo das avaliações** é texto livre: não escrever dados de saúde, familiares ou outros dados sensíveis.
- **Repositório público**: nunca fazer commit de `data/` nem de dados reais.

## Enquadramento

- RGPD art. 22 e Regulamento Europeu de IA: a app não toma nem propõe decisões automatizadas sobre pessoas. O prompt mestre proíbe o Claude de propor classificações.
- A utilização do Claude com estes dados foi indicada pelo utilizador como aprovada. Fornecedores com nome e dados comerciais devem ser confirmados com o compliance.

## Segurança técnica

- API só em `127.0.0.1`, com verificação do header Host.
- Só aceita JSON, corpo até 64 KB; SQL sempre parametrizado.
- Erros 500 sem detalhes internos.
- CSV protegido contra CSV injection.
