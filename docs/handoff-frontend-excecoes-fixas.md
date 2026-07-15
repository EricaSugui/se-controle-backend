# Feature nova no backend: Exceções de despesas/receitas fixas — implementar no app

> Brief para levar ao Claude Code do repo do frontend. Contrato completo no
> `openapi.bundled.yml` (versão **3.4.0**) do backend. Auth igual ao resto:
> Bearer token do Supabase. Pressupõe que o app já tem (ou terá) as telas de
> despesas/receitas fixas e seus status.

## Contexto — o problema que resolve

Um contrato fixo vigente pode ter um mês fora do padrão: carência de aluguel,
isenção pontual, cliente que cancelou o mês do freelance, bônus que não veio.
Sem exceção, essa competência fica `em_atraso`/`atrasado` **para sempre** no
status. A exceção registra o desvio com motivo e resolve a pendência — sem
criar lançamento falso e sem versionar o contrato (versionamento continua
sendo só para mudança permanente, tipo reajuste).

## O conceito-chave para a UI

**Lançamento vence exceção.**
- `pago`/`recebido` = a ocorrência **aconteceu** (existe compra/receita vinculada)
- **`justificado`** (status novo) = **não aconteceu**, mas tem explicação registrada
- Exceção sobre competência que já tem lançamento não muda o status — vira só
  anotação de auditoria (ex.: registrar que o valor veio diferente do esperado)

`justificado` sai da lista "em aberto" (como pago/recebido) e aparece na
visão por competência (`?competencia=`), ordenado por último.

## Endpoints (idênticos nos dois lados)

- `GET /despesas-fixas/:id/excecoes` — lista (qualquer membro que vê o contrato)
- `POST /despesas-fixas/:id/excecoes` — body:
  - `competencia_referencia` (obrigatória, MMM-AA em PT, dentro da vigência;
    mês-âncora para contratos anuais)
  - `valor_ocorrido?` (number ou null — null no caso "não vai acontecer")
  - `motivo?` (texto livre, até 255 chars)
  - `valor_esperado_original` é preenchido pelo **servidor** (snapshot do
    valor do contrato no momento) — não enviar
  - Duplicata na mesma competência → **409**
- `DELETE /despesas-fixas/:id/excecoes/:excecaoId` — 204; **remover a exceção
  reabre o atraso** no status
- Mesmos três em `/receitas-fixas/:id/excecoes`
- Permissões: escrever/remover exige admin da casa (ou dono, se contrato
  pessoal) — mesmas regras do contrato pai

## Mudança nos status existentes (atenção aos tipos!)

Os enums de status ganharam um valor — atualizar os tipos TS e qualquer
switch/mapa de cores:

- Despesas: `pago | em_dia | vencendo_hoje | em_atraso | justificado`
- Receitas: `recebido | aguardando | atrasado | justificado`

Sugestão visual: `justificado` em tom neutro/cinza (resolvido, mas não é
dinheiro que se moveu) — distinto do verde de pago/recebido.

## Sugestão de fluxos de UI

1. **Ação "Justificar" em item atrasado**: na lista de status, item
   `em_atraso`/`atrasado` ganha ação secundária "Justificar" ao lado de
   "Registrar pagamento/recebimento" → modal com motivo (e valor opcional) →
   POST na exceção → item some do em aberto.
2. **Lista de exceções no detalhe do contrato**: junto do histórico de
   lançamentos (`GET .../excecoes`), com opção de remover (confirmando que o
   atraso reabre).
3. **Visão do mês**: itens `justificado` aparecem com o motivo visível
   (buscar exceções do contrato para exibir o texto — o item de status não
   carrega o motivo).

## Checklist de integração

- [ ] Tipos de status atualizados (novo valor `justificado` nos dois enums)
- [ ] Services das exceções (GET/POST/DELETE × despesas/receitas)
- [ ] Ação "Justificar" nos itens atrasados do status
- [ ] Lista/remoção de exceções no detalhe do contrato
- [ ] Tratamento do 409 (competência já tem exceção)
