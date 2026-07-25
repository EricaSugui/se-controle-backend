# Desacoplamento da projeção de saldo (pré-requisito do motor de cenários)

> Análise de 2026-07-25, sobre `src/services/saldoProjetado.ts` como está
> após a PR #28. Contexto do porquê: entrada "Motor de cenários" em
> `backlog.md`. Nada aqui foi implementado ainda.

## Onde está o acoplamento hoje

1. **I/O e cálculo entrelaçados** — são 7 queries espalhadas pelo corpo de
   `calcularSaldoProjetado`, e o `adicionarEvento` filtra eventos *durante*
   os loops de carga. Não existe um ponto onde "o estado carregado" exista
   separado de "a projeção calculada".
2. **Escopo do endpoint embutido no cálculo** — a query de contas mistura a
   regra de visibilidade (`pessoaId` + `compartilha_saldo`) com a seleção do
   estado. Um cenário precisa projetar sobre um estado, não sobre "o que a
   pessoa X enxerga via query".
3. **Resolução de meio → conta feita em SQL** — o
   `CASE WHEN meio.tipo = 'credito' THEN conta_debito_id` vive na query de
   despesas fixas. Um delta hipotético "nova despesa fixa no cartão Y"
   precisaria dessa resolução no motor, não no banco.
4. **`hoje` calculado dentro** (`hojeNoFuso`) — a função não é
   determinística, o que impede testar e impede comparar cenários com o
   mesmo relógio.

## Corte proposto: 3 camadas

- **`carregarEstadoProjecao(pessoaId, {ate, fuso})` → `EstadoProjecao`** —
  só I/O. Devolve dados puros: contas (com saldo_base/data), receitas
  lançadas, parcelas, faturas, contratos fixos com suas competências já
  resolvidas (pagas/justificadas), e o mapa cartão → conta_debito.
- **`projetar(estado): ContaProjetada[]`** — função pura, sem import de
  `db`, determinística (recebe `hoje` e `ate` no estado). Concentra:
  expansão de competências esperadas, clamp de dia, janela de eventos,
  resolução meio → conta, agregação e arredondamento.
- **`calcularSaldoProjetado`** vira composição fina: carregar + projetar +
  avisos. **Assinatura pública mantida** → rota, contrato OpenAPI e app
  intactos; é refactor invisível externamente.

## Decisões de design

- **Deltas aplicam sobre o `EstadoProjecao`**, antes de projetar —
  `projetar(aplicarDeltas(estado, deltas))` — e não sobre a lista de
  eventos. Motivo: "alterar/encerrar contrato" exige re-expandir
  competências, o que só o motor sabe fazer.
- **Avisos ficam fora do motor** — são sobre completude da configuração
  real; cenários não precisam deles.
- **`ate` continua filtrando no SQL** do load — cenários usam a mesma
  janela do estado carregado; se um dia for preciso comparar horizontes
  diferentes, carrega-se com o horizonte máximo.

## Ganho colateral

O projeto não tem nenhum teste hoje. O motor puro vira a primeira peça
unit-testável: dado um `EstadoProjecao` construído à mão, a projeção é
determinística e roda sem banco.
