# Relatório de gastos — desenho fechado (não implementado)

> Análise de 2026-07-25. Motivação: "para onde foi meu dinheiro" é pergunta
> diferente da que o dashboard responde. Casos concretos que guiaram o
> desenho: gastos da filha; comparar educação lançada como da Erica vs do
> marido; oportunidades de enxugamento.

## Endpoint

```
GET /relatorios/gastos?casa_id=X&de=AAAA-MM&ate=AAAA-MM&eixo=competencia|caixa
```

- **`casa_id` obrigatório** — nunca mistura casas; analisar a própria casa
  e a Casa da Mamãe são exercícios separados. Validação na camada de app
  (pessoa pertence à casa), como nos demais endpoints — não RLS.
- **Intervalo de competências** (`de`/`ate`) já no v1 — "enxugamento" vira
  "esse mês vs anteriores"; a série nativa custa só a competência a mais no
  GROUP BY e evita N chamadas do app.
- **`eixo`** decide a coluna de data, mesmo padrão do dashboard
  (`resumoFinanceiro.ts`): `compras.competencia` ou
  `parcelas_com_caixa.data_caixa` agrupada por mês.

## Resposta: a matriz, não as visões

Uma linha por `(mes, categoria, pessoa)` com o total. O app deriva daí, sem
endpoints extras:

- gasto por categoria da casa (soma sobre pessoas);
- gasto por pessoa (soma sobre categorias);
- drill-down categoria × pessoa ("quem gasta mais com educação");
- evolução mês a mês de qualquer um dos cortes.

Incluir `icone`/`cor` da categoria na resposta (colunas já existem desde as
PRs #35/#36) — o relatório nasce visual sem trabalho extra no app.

## Semânticas fixadas

- **"Pessoa" = `compras.pessoa_id`** (de quem é o gasto / responsável).
  Não é `lancado_por_id` (quem registrou) nem rateio (quem bancou).
- **"Quem bancou" fica fora** — rateio resolvido
  (`compra_pagadores` → senão `percentuais_custeio`) é outra pergunta e
  virou a entrada "Acerto de contas / reembolso" no backlog, com
  `regra-rateio-custeio.md` como spec.
- **Parceladas**: no eixo caixa, a compra aparece espalhada pelos meses das
  parcelas (o que sai do bolso); no eixo competência, cai inteira no mês da
  compra. Mesma semântica do dashboard — só fica mais visível no relatório.
- **Query agregada parametrizada, sem view nova** — é SUM/GROUP BY puro,
  sem estado a resolver; coerente com *derived views over stored state*.
  Se a base crescer, otimizar depois é evolução, não requisito.

## Premissas corrigidas da análise original (Claude.ai web)

A primeira análise foi feita fora do repo e assumiu três coisas erradas:
`transacoes` como fonte (dropada — a fonte é `compras` + `parcelas`),
autorização via RLS/`auth.uid()` (o pool é superuser; autorização é da
camada de app) e "pessoa do gasto" como conceito único (são três: dono,
lançador, pagador). Este documento substitui aquela análise.
