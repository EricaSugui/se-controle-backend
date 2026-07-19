# Correção de UX no app: competência default deve derivar da DATA, não de "hoje"

> Brief para o Claude Code do repo do frontend. Bug de UX real, encontrado no
> primeiro uso de verdade (backfill de receitas de junho lançadas em julho).

## O bug

Nos formulários de lançamento (confirmado em **receitas**; conferir também
**compras**), o campo `competencia` está sendo preenchido com o **mês
corrente no momento do lançamento**, ignorando a `data` que o usuário
escolheu no próprio formulário.

Caso real: em 19/07, usuária lançou o salário de junho com `data =
30/06/2026` — e o app enviou `competencia = JUL-26`. Resultado: o dashboard
e o fechamento mensal (que agrupam por competência) mostraram junho vazio e
julho inflado. Aconteceu em **todos os 5 lançamentos** do backfill.

Detalhe importante: a `competencia_referencia` do vínculo com receita fixa
veio **correta** (JUN-26) — o formulário do vínculo está certo; o problema é
só o default do campo `competencia`.

## O comportamento certo

1. **Default**: ao escolher/alterar a `data` no formulário, derivar a
   competência default do **mês da data** (`30/06/2026` → `JUN-26`), no
   formato `MMM-AA` em português maiúsculo (JAN, FEV, MAR, ABR, MAI, JUN,
   JUL, AGO, SET, OUT, NOV, DEZ).
2. **Editável**: manter o campo alterável pelo usuário — o desacoplamento
   data ≠ competência é legítimo e intencional (ex.: conta da competência de
   junho paga em julho). O default certo não vira trava.
3. **Nunca** usar "hoje" como fonte da competência default — hoje é
   irrelevante para o lançamento; só a data do evento importa.

## Onde aplicar

- Form de **receita** (confirmado com o bug)
- Form de **compra/despesa** (mesma lógica de competência — auditar se tem o
  mesmo default errado)
- Qualquer outro lugar que pré-preencha competência

## Por que o backend não corrige sozinho

O backend valida só o formato e grava o que o app envia — por design:
competência é eixo de orçamento, independente do eixo caixa (`data`), e o
servidor não tem como distinguir um desacoplamento deliberado de um default
errado do form. A responsabilidade do default correto é da UI.

## Dados já corrigidos

Os 4 lançamentos de junho afetados no banco foram corrigidos manualmente
(competencia JUL-26 → JUN-26) em 19/07/2026 — não é preciso migração de
dados, só o fix do form daqui pra frente.
