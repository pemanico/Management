# Agentes e uso com o Claude

## Como funciona

O separador **Exportar** copia para a área de transferência o **prompt mestre** (`src/prompt.ts`) seguido do **resumo agregado** em JSON (o mesmo que alimenta o separador Resumo). Cola numa conversa nova do Claude e pede a análise.

Não há chamada automática a nenhuma API: o envio é sempre manual.

## Os 5 agentes

O prompt define um "Chief of Staff" que coordena cinco agentes. São papéis dentro da mesma conversa, não processos separados.

| Agente | Olha para | Perguntas a que responde |
| --- | --- | --- |
| Budget & Headcount | Headcount orçamentado e ativo por tipo, vagas, excessos | Onde estou acima ou abaixo do budget? Internos ou externos? |
| Consultores & Rates | Externos, fornecedores, rates médias, custo mensal e anual, contratos a expirar | Quanto custam os externos? Que renovações preparar? |
| Skill Matrix & Formação | Cobertura por equipa e competência, gaps, formações | Onde há risco de conhecimento? Que formação fecha o gap? |
| Performance & Objetivos | Agregados de objetivos e contagens de avaliações | Que equipas têm objetivos em risco? O ciclo está fechado? |
| Portfolio & Alocações | Projetos, prioridade, FTE alocados, bench, sobre-alocação | Que projetos estão sub-staffed? Quem posso realocar? |

## Regras do prompt (resumo)

- Trabalha só com os dados fornecidos; não inventa números e lista primeiro o que falta ou está desatualizado.
- Prepara e recomenda; a decisão é do manager.
- Nunca tenta identificar pessoas nem propõe classificações de avaliação.
- O budget é em headcount; euros a 0 significam "sem budget em dinheiro".
- Custo de externos sempre a 20 dias × 11 meses.
- Headcount por equipa pode ter frações (pessoas repartidas); os totais contam pessoas inteiras.
- Formato de resposta: top 5 alertas, KPIs por equipa, decisões pendentes.

## Pedidos úteis depois de colar o export

- "Faz o ponto de situação mensal da unidade."
- "Só o agente Portfolio & Alocações: que realocações resolvem os projetos de prioridade alta sub-staffed?"
- "Que contratos de externos expiram nos próximos 90 dias e o que tenho de decidir para cada fornecedor?"
- "Prepara a agenda da reunião com os gestores de projeto a partir dos alertas."
- "Compara com o export do mês passado" (cola os dois).

## Quando alterar o prompt

Sempre que o resumo ganhar ou mudar campos, atualizar `src/prompt.ts` na mesma alteração: o Claude só interpreta bem campos que o prompt explica.

## Limites

- O Claude não vê dados individuais de skills, objetivos ou avaliações, por isso não pode (nem deve) aconselhar sobre pessoas concretas nesses temas.
- As recomendações dependem da atualidade dos dados: tratar primeiro os alertas de dados antigos.
