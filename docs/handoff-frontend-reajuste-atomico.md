# Handoff frontend — Reajuste atômico (contrato 3.8.0)

> Backend entregue em 2026-07-25. Robustez pré-onboarding da família: o
> fluxo de reajuste em 2 chamadas podia deixar contrato encerrado sem
> sucessor se a segunda falhasse.

## O que muda no app

Onde o fluxo de reajuste de despesa/receita fixa hoje faz **encerrar +
criar** (2 requests), passar a fazer **1 request**:

```
POST /despesas-fixas/:id/reajustar
{ "valor_referencia": 2200, "vigente_desde": "2026-08-01", "dia_esperado": 10? }

POST /receitas-fixas/:id/reajustar
{ "valor_esperado": 5500, "vigente_desde": "2026-08-01", "dia_esperado_recebimento": 5? }
```

- Resposta `201`: `{ anterior, nova }` — o contrato encerrado e a nova
  versão, já vinculados.
- O backend encerra o contrato atual em `vigente_desde − 1 dia` (sem
  sobreposição nem buraco) e a nova versão **herda** categoria/origem,
  descrição, tipo, periodicidade e cartão/conta padrão — o form só
  precisa pedir o valor novo, a data de início e (opcional) o dia
  esperado.
- `400` se o contrato já estiver encerrado ou se `vigente_desde` não for
  posterior ao início do contrato atual.
- Os endpoints antigos (`PATCH :id/encerrar` e `POST /` com
  `*_anterior_id`) continuam existindo para os demais usos (encerrar sem
  sucessor; migrações manuais) — só o fluxo de REAJUSTE muda.
