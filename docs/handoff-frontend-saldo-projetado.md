# Feature nova no backend: Saldo Projetado — implementar no app

> Brief para levar ao Claude Code do repo do frontend. Contrato completo no
> `openapi.bundled.yml` (versão **3.5.0**) do backend. Auth igual ao resto.
> Pressupõe as telas de despesas/receitas fixas e exceções já integradas.

## Contexto

O backend agora projeta o saldo futuro **por conta**: saldo de referência +
tudo que vai entrar e sair até um horizonte (receitas lançadas e esperadas,
faturas a vencer, parcelas de débito, despesas fixas esperadas — respeitando
exceções justificadas). Junto vieram evoluções de cadastro que a UI precisa
expor.

## Mudanças no cadastro de cartões/contas (atenção aos forms!)

- `tipo` ganhou **`aplicacao`** (enum agora: credito | debito | aplicacao).
- **`titular_id` é obrigatório** em POST/PUT (antes era opcional — form
  precisa enviar sempre; sugestão: default = usuário logado).
- Campos novos por tipo:
  - **Contas (debito/aplicacao)**: `saldo_base` + `saldo_base_data` (par
    obrigatório — os dois ou nenhum). É o "saldo hoje" que o usuário informa
    e atualiza de tempos em tempos.
  - **Cartões (credito)**: `conta_debito_id` — de qual conta sai o pagamento
    da fatura (só contas do MESMO titular; o backend valida). **Campo
    importante**: cartão sem ele fica fora da projeção.
- Campos de um tipo enviados no outro → 400 (ex.: limite em conta).

## Mudanças em lançamentos e contratos

- **Receitas**: campo `conta_destino_id` (conta onde entra; só
  debito/aplicacao). **Herança**: receita vinculada a receita fixa com campo
  OMITIDO herda o default do contrato — enviar `null` explícito significa
  "sem conta". Cuidado com serializadores que transformam undefined em null!
- **Receitas fixas**: `conta_destino_id` (default do contrato).
- **Despesas fixas**: `cartao_conta_padrao_id` (meio de pagamento default —
  qualquer tipo). Compra vinculada herda igual (omitido herda, null não).
- **Formas de pagamento**: campo `exige_conta` (gestão via painel admin do
  sistema). Compra com forma exigente (ex. PIX) e sem `cartao_conta_id`
  (após herança) → **400** com mensagem nomeando a forma — exibir no form.
- **Visibilidade**: `compartilha_saldo` (novo toggle por casa, separado de
  `compartilhado`). Default false. Só o titular gerencia.

## O endpoint principal

`GET /saldo-projetado?ate=2026-08-31` (`ate` opcional; default = último dia
do mês seguinte, no fuso do usuário). Response:

- `contas[]`: cada uma com `conta` (id/nome/tipo/titular), `saldo_base`,
  `saldo_base_data`, `sem_saldo_base` (flag), `fluxo_liquido`,
  `saldo_projetado` (null quando sem saldo_base) e **`eventos[]`** — timeline
  ordenada por data com `{ data, tipo, descricao, valor }` (valor com sinal:
  entradas +, saídas −). Tipos: `receita | receita_esperada | parcela_debito
  | fatura | despesa_esperada`.
- `eventos[].valor_indefinido: true` = receita esperada de contrato variável
  sem estimativa (entra como 0 na soma) — sinalizar visualmente.
- `avisos[]`: configuração incompleta (cartão sem conta de débito, contratos
  sem meio/conta padrão) — mostrar como call-to-action de setup, não como
  erro.
- **Privacidade**: contas de outros membros só aparecem se o titular ligou
  `compartilha_saldo` para uma casa em comum.

## Sugestão de telas

1. **Saldo projetado**: card por conta (saldo hoje → saldo projetado), com
   gráfico de linha acumulando `eventos` (saldo_base + soma progressiva) e
   extrato futuro abaixo. Contas `sem_saldo_base`: mostrar só o fluxo e um
   CTA "informe o saldo atual".
2. **Onboarding da projeção** (primeira visita): guiar pelos `avisos` —
   preencher saldo_base das contas, vincular cartões às contas
   (`conta_debito_id`), defaults nos contratos.
3. **Perfil de conta/cartão**: forms atualizados por tipo (ver acima) e o
   toggle duplo de compartilhamento (lançamentos × saldo).

## Checklist de integração

- [ ] Tipos regenerados do bundle 3.5.0 (enum `aplicacao`, campos novos)
- [ ] Form de cartão/conta por tipo (+ titular obrigatório)
- [ ] Campo conta destino em receitas (com herança omitido/null correta)
- [ ] Defaults de conta/cartão nos forms de contratos
- [ ] Toggle compartilha_saldo na visibilidade
- [ ] Tela de saldo projetado + tratamento de avisos
- [ ] Tratamento do 400 de exige_conta no form de compra
