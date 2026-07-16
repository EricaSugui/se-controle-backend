# Backlog — se-controle-backend

> Atualizado em 2026-07-16, após a projeção de saldo (branch
> feature/saldo-projetado). Fonte da verdade dos pendentes; as decisões já
> tomadas estão em `decisoes-superficie-api.md`.

## Entregue recentemente

- ✅ **Projeção de saldo** (`GET /saldo-projetado`, PR #28) — evolução de
  cartoes_contas (tipo aplicacao, saldo_base, conta_debito_id), conta destino
  nos contratos com herança, PIX exige conta, compartilhamento de saldo
  opt-in. **Frontend concluído** (jul/2026), incluindo os handoffs
  anteriores (despesas/receitas fixas, fuso, exceções).

## Próximos candidatos

- **Projeção no tempo (gráfico)**: o endpoint já devolve a timeline de
  eventos por conta — a UI decide granularidade; se precisar de série diária
  agregada pelo backend, é evolução pequena do service.
- **Despesa fixa esperada em cartão de crédito**: hoje projetada na
  data_esperada (simplificação); refinamento futuro é projetá-la no
  vencimento da fatura em que cairia.

## Backlog de features (sem urgência, já com contexto)

- **Hash chain** — intenção antiga de adicionar uma cadeia de hash ao
  backend (integridade/auditoria de lançamentos). Nunca escopado.
- **`POST /despesas-fixas/:id/reajustar` atômico** (e espelho em receitas) —
  hoje o versionamento é em 2 chamadas (encerrar + criar com `*_anterior_id`).
- **Checagem de coerência de valor nas exceções** — o status compara
  existência, não valor; `valor_ocorrido`/`valor_esperado_original` já
  gravados preparam essa checagem.
- **Motivos categorizados de exceção** — hoje texto livre (`motivo`).
- **Suavização de valor de receitas variáveis** — média de meses anteriores
  para `valor_esperado` de freelance (decisão da modelagem de receitas fixas).

## Micro-melhorias (fazer quando incomodar)

- **`pode_editar` nos GETs de despesas/receitas fixas** — compras/receitas
  têm; fixas não. Adicionar se o frontend sentir falta (o app pode inferir
  pelo papel na casa enquanto isso).
- ~~Aba de performance do linter do Supabase~~ — revisada em jul/2026: os 2
  alertas (auth_rls_initplan em pessoas) corrigidos; segurança já tratada na
  PR #26.

## Riscos aceitos (reavaliar se o contexto mudar)

- **Leaked Password Protection desligada** — exige plano pago; aceito no
  free tier. Ligar no dashboard (Auth → senha) se migrar de plano; nesse
  caso, conferir se o cadastro do app exibe o erro `weak_password`.
- **Pool do backend é superuser e bypassa RLS** — por design; a autorização
  efetiva é a da camada de app, e o RLS é defesa em profundidade para o
  acesso direto via Supabase.

## Do lado do frontend (se-controle-rn)

- ✅ Todos os handoffs consumidos (despesas/receitas fixas, fuso, exceções e
  saldo projetado) — app em dia com o contrato 3.5.0.
