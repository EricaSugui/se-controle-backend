# Handoff frontend — Acerto de contas (contrato 3.6.0)

> Backend entregue em 2026-07-25. Contexto de produto em
> `acerto-contas.md`. Caso de uso imediato: Casa da Mamãe (casa 2) — a
> Karina banca 100% e reembolsa a Erica pelo que ela desembolsa.

## Tela nova: Acerto de contas (por casa)

`GET /casas/:casaId/acerto` devolve tudo que a tela precisa:

- **`saldos`** — o resumo principal: por pessoa, `devido`, `desembolsado`,
  pagamentos enviados/recebidos e `saldo` (positivo = a receber; a soma
  entre as pessoas fecha em zero). É o "Karina te deve R$ X".
- **`meses`** — extrato mensal derivado (mais recente primeiro), com
  devido/desembolsado/acerto por pessoa. Bom para o drill-down "de onde
  veio esse valor".
- **`pagamentos`** — transferências registradas (reembolsos e
  adiantamentos, mesmo registro), com nomes resolvidos.
- **`avisos`** — mesmo padrão do saldo projetado (guiam, não bloqueiam):
  `meses_sem_combinado` (compras fora do acerto por falta de percentual de
  custeio no mês), `compras_sem_meio`, `rateio_nao_soma_100`,
  `combinado_nao_soma_100`.

## Registrar pagamento/adiantamento

`POST /casas/:casaId/acerto/pagamentos` com `{ de_pessoa_id,
para_pessoa_id, valor, data, observacao? }`. Adiantamento ("te mando 5000
para os gastos do mês") é um pagamento normal — vira crédito que os gastos
vão consumindo. `DELETE /casas/:casaId/acerto/pagamentos/:id` desfaz
(quem registrou, ou admin).

## Eixo do acerto (quando a compra entra)

- Padrão da casa: `casas.acerto_eixo` (`competencia` default | `caixa`),
  editável no `PUT /casas/:id` (campo opcional; omitido preserva).
- Override por compra: `compras.acerto_eixo` (nullable) no POST/PUT de
  compras — caso "geladeira 5000 em 10x que deve pingar parcela a parcela
  no acerto". Null/omitido segue o padrão da casa.
- Competência = valor cheio no mês da compra; caixa = por parcela na
  `data_caixa` (no crédito, acompanha a fatura da pagadora).

## O que o backend infere sozinho (a UI não pede)

- **Quem desembolsou**: titular do meio de pagamento da compra. Compra sem
  cartão/conta fica fora do acerto (aviso).
- **Quem deve**: `compra_pagadores` da compra quando existir (exceção
  pontual), senão `percentuais_custeio` da competência da compra.

## Pré-requisito de dados por casa (onboarding da tela)

O acerto exige o combinado registrado por competência —
`POST /casas/:id/percentual-custeio` (já existia). Sem linha do mês, as
compras daquele mês ficam fora e chega o aviso `meses_sem_combinado` —
sugerir na UI o cadastro do percentual ao ver esse aviso. Já cadastrado em
produção: JUL-26 da casa 2 (Karina 100 / Erica 0). Karina existe como
pessoa (id 39, admin da casa 2) SEM login — quando ela criar conta, usar o
fluxo existente `POST /auth/vincular`.
