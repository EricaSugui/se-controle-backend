// Conta destino nos dois lados do fluxo, para a projeção de saldo saber por
// onde o dinheiro entra e sai:
// - receitas.conta_destino_id: em qual conta a receita entra
// - receitas_fixas.conta_destino_id: default do contrato (herdado pela
//   ocorrência quando o campo vem omitido no lançamento)
// - despesas_fixas.cartao_conta_padrao_id: meio de pagamento default do
//   contrato (espelha compras.cartao_conta_id; pode ser cartão de crédito —
//   a projeção resolve a conta via conta_debito_id do cartão)

exports.up = (pgm) => {
  pgm.addColumns('receitas', {
    conta_destino_id: { type: 'integer', references: 'cartoes_contas', onDelete: 'RESTRICT' },
  });
  pgm.addColumns('receitas_fixas', {
    conta_destino_id: { type: 'integer', references: 'cartoes_contas', onDelete: 'RESTRICT' },
  });
  pgm.addColumns('despesas_fixas', {
    cartao_conta_padrao_id: { type: 'integer', references: 'cartoes_contas', onDelete: 'RESTRICT' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('despesas_fixas', ['cartao_conta_padrao_id']);
  pgm.dropColumns('receitas_fixas', ['conta_destino_id']);
  pgm.dropColumns('receitas', ['conta_destino_id']);
};
