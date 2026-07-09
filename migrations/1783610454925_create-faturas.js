exports.up = (pgm) => {
  pgm.createTable('faturas', {
    id: 'id',
    cartao_conta_id: { type: 'integer', notNull: true, references: 'cartoes_contas', onDelete: 'RESTRICT' },
    mes_referencia: { type: 'varchar(10)', notNull: true },
    data_abertura: { type: 'date' },
    data_fechamento: { type: 'date', notNull: true },
    data_vencimento: { type: 'date', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('faturas', 'faturas_cartao_conta_id_mes_referencia_unique', 'UNIQUE (cartao_conta_id, mes_referencia)');
  pgm.addConstraint('faturas', 'faturas_fechamento_antes_vencimento_check', 'CHECK (data_fechamento < data_vencimento)');
  pgm.addConstraint('faturas', 'faturas_abertura_antes_fechamento_check', 'CHECK (data_abertura IS NULL OR data_abertura <= data_fechamento)');
  pgm.createIndex('faturas', 'data_vencimento');
  pgm.sql('ALTER TABLE faturas ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('faturas');
};
