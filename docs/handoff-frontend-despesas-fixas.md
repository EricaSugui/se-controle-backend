# Feature nova no backend: Despesas Fixas — implementar no app

> Brief para levar ao Claude Code do repo do frontend. O contrato completo da
> API está no `openapi.bundled.yml` (versão 3.2.0) do backend — usar como
> fonte da verdade. Auth é igual ao resto: Bearer token do Supabase.

## Contexto

O backend (se-controle-backend) ganhou a feature de **despesas fixas**:
contratos recorrentes (aluguel, assinaturas, contas) com detecção de gaps de
pagamento.

## Modelo mental (3 conceitos)

1. **Contrato** (`despesas_fixas`): a obrigação recorrente. Ex.: "Aluguel -
   apto Campinas, R$1500, mensal, vence dia 5". Tem escopo de **casa OU
   pessoa** (exatamente um), e vigência (`vigente_desde`/`vigente_ate`;
   `vigente_ate` nulo = ainda ativo).
2. **Pagamento**: uma compra comum (`POST /compras`) com dois campos a mais:
   `despesa_fixa_id` + `competencia_referencia` (competência do contrato que
   está sendo quitada, formato MMM-AA, ex. JUL-26).
3. **Status** (`GET /despesas-fixas/status`): calculado pelo backend — nunca
   calcular no frontend. Cada item é (contrato × competência esperada) com
   `status`: `pago` | `em_dia` | `vencendo_hoje` | `em_atraso`.

## Endpoints

- `GET /despesas-fixas` — lista (filtros: `casa_id`, `pessoa_id`,
  `vigente=true|false`). Cada item traz `categoria_nome`.
- `GET /despesas-fixas/:id`
- `POST /despesas-fixas` — body: `casa_id` OU `pessoa_id`, `categoria_id`,
  `descricao`, `tipo_valor` (`fixo`|`variavel_estimado`), `valor_referencia`
  (number!), `periodicidade` (`mensal`|`anual`), `dia_esperado` (1–31),
  `vigente_desde`, `vigente_ate?`, `despesa_fixa_anterior_id?`
- `PUT /despesas-fixas/:id` — corpo completo; escopo não é alterável
- `PATCH /despesas-fixas/:id/encerrar` — body opcional `{ vigente_ate }`
  (default hoje)
- `GET /despesas-fixas/status?competencia=JUL-26&folga_dias=3` — ambos
  opcionais:
  - sem `competencia`: só itens **em aberto** (para badge/alertas)
  - com `competencia`: visão de fechamento do mês, **incluindo pagos**
- `GET /compras?despesa_fixa_id=N` — histórico de pagamentos de um contrato

## Regras que afetam a UX

- **Não existe DELETE** de despesa fixa — a ação é "Encerrar". Encerrada hoje
  ainda conta como vigente até o fim do dia.
- **Permissões**: qualquer membro da casa vê; só **admin da casa** cria/edita/
  encerra despesas da casa (403 caso contrário). Despesa pessoal: só o dono vê
  e mexe (para os outros é 404). Não há campo `pode_editar` — usar o papel do
  usuário na casa (já disponível no app) ou tratar o 403.
- **Reajuste de contrato** = 2 chamadas: `PATCH /:id/encerrar` + `POST /` com
  `despesa_fixa_anterior_id` apontando o antigo (que precisa estar encerrado).
- **"Marcar como pago"** = criar compra com `despesa_fixa_id` (e
  `competencia_referencia` da competência em aberto). Se omitir a referência,
  o backend assume a competência da compra. Para contratos **anuais**, a
  referência tem que ser o mês de `vigente_desde` (mês-âncora) — o backend
  rejeita outros meses com 400.
- Valores monetários vão como **number** no JSON (não string "1.500,00").
- Erros vêm como `{ "erro": "mensagem em português" }` — dá para exibir direto.

## Sugestão de telas (validar antes de implementar)

1. **"Contas do mês"**: `GET /despesas-fixas/status?competencia=<mês corrente>`,
   agrupado por status (atrasadas no topo — a API já ordena por severidade),
   com ação rápida "registrar pagamento" que abre o form de compra
   pré-preenchido.
2. **Badge/alerta** no dashboard: contagem de `em_atraso` + `vencendo_hoje`
   do `GET /despesas-fixas/status` sem filtro.
3. **Gestão de contratos**: lista de `GET /despesas-fixas?vigente=true`, com
   detalhe mostrando histórico (`GET /compras?despesa_fixa_id=`) e ações
   Editar / Encerrar / Reajustar (o fluxo de 2 chamadas).
