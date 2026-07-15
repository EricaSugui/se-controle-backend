# Backlog — se-controle-backend

> Atualizado em 2026-07-15, após o ciclo de recorrência (PRs #22–#26).
> Fonte da verdade dos pendentes; as decisões já tomadas estão em
> `decisoes-superficie-api.md`.

## Próxima feature grande

- **Projeção de saldo** — tela/endpoint combinando os dois lados do fluxo
  recorrente: esperado a pagar (`GET /despesas-fixas/status`) + esperado a
  receber (`GET /receitas-fixas/status`), ambos já com valores esperados e
  "hoje" no fuso do usuário. Toda a matéria-prima está pronta.

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
- **`PUT /pessoas/:id` apaga `email` quando omitido** (semântica replace) —
  já mordeu num teste. Trocar por `COALESCE` como foi feito com
  `fuso_horario`.
- **Aba de performance do linter do Supabase** — nunca revisada (índices,
  etc.). Os alertas de segurança foram todos tratados na PR #26.

## Riscos aceitos (reavaliar se o contexto mudar)

- **Leaked Password Protection desligada** — exige plano pago; aceito no
  free tier. Ligar no dashboard (Auth → senha) se migrar de plano; nesse
  caso, conferir se o cadastro do app exibe o erro `weak_password`.
- **Pool do backend é superuser e bypassa RLS** — por design; a autorização
  efetiva é a da camada de app, e o RLS é defesa em profundidade para o
  acesso direto via Supabase.

## Do lado do frontend (se-controle-rn)

- Consumir os 3 handoffs em `docs/`: despesas fixas, receitas fixas + fuso
  horário, e exceções (`justificado` muda os enums de status!).
