# Acerto de contas / reembolso — desenho fechado (não implementado)

> Análise de 2026-07-25. Caso concreto que guiou o desenho: Casa da Mamãe —
> Erica e irmã compartilham a gestão; o combinado é a irmã bancar 100%, e
> ela reembolsa a Erica pelo que a Erica desembolsa. Às vezes atrasa, às
> vezes acumula, e existe o cenário de adiantamento ("estou te enviando
> 5000 para os gastos desse mês"). Implementa em código a regra já
> documentada em `regra-rateio-custeio.md`.

## Modelo conceitual: dois lados por pessoa, por mês

- **Devido** — quanto a pessoa *deveria bancar*: por compra, o rateio de
  `compra_pagadores` se existir (exceção pontual), senão o
  `percentuais_custeio` da casa+competência. É a regra de prioridade do
  `regra-rateio-custeio.md`, nunca implementada até aqui.
- **Desembolsado** — quanto a pessoa *adiantou de fato*: inferido do
  titular do meio de pagamento (`compras.cartao_conta_id` →
  `cartoes_contas.titular_id`). Nenhum lançamento manual novo.
- **Acerto do mês** = desembolsado − devido (positivo = a receber). A soma
  entre as pessoas fecha em zero.

A exceção via `compra_pagadores` se comporta bem: "esse remédio eu banco
100%" faz devido e desembolsado da pessoa se cancelarem — sem reembolso.

## Saldo corrente, não extrato mensal com flag

Atraso, acúmulo e adiantamento inviabilizam "marcar mês como acertado".
O modelo é uma **conta corrente entre as pessoas da casa**:

- **Lado derivado** (nada persistido): os acertos mensais, calculados das
  compras.
- **Lado persistido** (única escrita nova): `acerto_pagamentos` — casa,
  quem pagou, quem recebeu, valor, data, observação. Reembolso e
  adiantamento são o mesmo registro.
- **Saldo corrente** = Σ acertos mensais + Σ pagamentos. Adiantamento gera
  crédito que os gastos vão consumindo; atraso carrega saldo para o mês
  seguinte; "acertado" é o saldo chegar a zero — estado emergente, não
  marcado.

Coerente com *derived views over stored state*: persiste-se o evento real
(a transferência aconteceu), deriva-se o resto. `acerto_pagamentos` NÃO
toca o ledger da casa — a regra de não registrar reembolso como `receita`
(que inflaria o saldo da casa) segue valendo.

## Eixo do acerto: default da casa + exceção por compra

O eixo muda o *quando*, nunca o *quanto* — por isso os dois podem
coexistir sem dupla contagem, desde que cada compra siga exatamente um:

- `casas.acerto_eixo` (`competencia` | `caixa`) — padrão da casa.
  Competência = reembolso pelo valor cheio no mês da compra (geladeira de
  5000 em 10x → 5000 no acerto do mês). Caixa = pinga conforme as parcelas
  desaguam (no crédito: na fatura — o reembolso acompanha o desembolso
  real, com o delay do ciclo do cartão).
- `compras.acerto_eixo` (nullable) — sobrepõe o padrão para aquela compra
  (ex.: a geladeira grande demais para entrar de uma vez). Mesmo padrão de
  precedência do rateio: regra da casa + exceção pontual.
- Criar as DUAS colunas já na migration do v1, mesmo que a UI da exceção
  venha depois — evita segunda migration; no service é só o "eixo efetivo"
  (override ∨ default).

## Pessoa sem login (irmã): já suportado, zero desenvolvimento

`pessoas.supabase_user_id` e `email` são opcionais; `POST /auth/vincular`
liga um login recém-criado a uma pessoa pré-existente. Fluxo: criar a
pessoa da irmã agora, colocar em `casa_pessoas`, registrar o combinado em
`percentuais_custeio` (irmã 100%); quando ela criar conta, vincular.

## Superfície

- `GET /casas/:id/acerto` — saldo corrente por pessoa + extrato (acertos
  mensais derivados e pagamentos registrados) + avisos.
- `POST /casas/:id/acerto/pagamentos` — registra transferência
  (reembolso/adiantamento).
- 1 migration (`acerto_pagamentos` + `acerto_eixo` em casas e compras),
  1 service, 1 rota.

## Avisos (padrão dos avisos da projeção — guiam, não bloqueiam)

- Mês sem `percentuais_custeio` registrado — o acerto NÃO assume default
  em silêncio (o dashboard assume 100% para quem consulta; aqui isso seria
  silenciosamente errado).
- Compras sem `cartao_conta_id` — desembolsador não inferível, fora do
  acerto.
- `compra_pagadores` com percentuais que não somam 100 (e decidir o
  significado de `percentual` NULL — hoje o schema permite; exigir valor
  ou definir divisão igual).
