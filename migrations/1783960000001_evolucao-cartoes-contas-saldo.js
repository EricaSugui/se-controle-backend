// Evolução de cartoes_contas para o saldo projetado:
// - tipo 'aplicacao': conta de investimento (sem fatura, sem limite)
// - saldo_base + saldo_base_data: ponto de partida da projeção, mora na
//   conta (débito/aplicação) — sem fallback em pessoa (multi-conta é real)
// - conta_debito_id: de qual conta sai o pagamento da fatura do cartão de
//   crédito — o elo que faltava para agregar saídas de fatura por conta
//   (cobre também cartões adicionais: a fatura desagua na conta do titular,
//   independente de quem usou o cartão)
// Regras entre linhas/colunas (conta_debito aponta conta do mesmo titular,
// saldo só em conta, etc.) ficam na camada de app, como no resto do repo.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE cartoes_contas DROP CONSTRAINT cartoes_contas_tipo_check;
    ALTER TABLE cartoes_contas ADD CONSTRAINT cartoes_contas_tipo_check
      CHECK (tipo IN ('credito', 'debito', 'aplicacao'));
  `);

  pgm.addColumns('cartoes_contas', {
    saldo_base: { type: 'numeric(12,2)' },
    saldo_base_data: { type: 'date' },
    conta_debito_id: { type: 'integer', references: 'cartoes_contas', onDelete: 'RESTRICT' },
  });

  pgm.addConstraint(
    'cartoes_contas',
    'cartoes_contas_saldo_base_par_check',
    'CHECK ((saldo_base IS NULL) = (saldo_base_data IS NULL))'
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint('cartoes_contas', 'cartoes_contas_saldo_base_par_check');
  pgm.dropColumns('cartoes_contas', ['saldo_base', 'saldo_base_data', 'conta_debito_id']);
  pgm.sql(`
    ALTER TABLE cartoes_contas DROP CONSTRAINT cartoes_contas_tipo_check;
    ALTER TABLE cartoes_contas ADD CONSTRAINT cartoes_contas_tipo_check
      CHECK (tipo IN ('credito', 'debito'));
  `);
};
