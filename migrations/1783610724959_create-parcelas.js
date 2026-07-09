exports.up = (pgm) => {
  pgm.createTable('parcelas', {
    id: 'id',
    compra_id: { type: 'integer', notNull: true, references: 'compras', onDelete: 'CASCADE' },
    numero_parcela: { type: 'smallint', notNull: true, check: 'numero_parcela >= 1' },
    valor: { type: 'numeric(12,2)', notNull: true },
    fatura_id: { type: 'integer', references: 'faturas', onDelete: 'RESTRICT' },
    data_propria: { type: 'date' },
    transacao_legado_id: { type: 'integer' }, // FK real só depois do rename (step 8)
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('parcelas', 'parcelas_compra_id_numero_parcela_unique', 'UNIQUE (compra_id, numero_parcela)');
  pgm.addConstraint(
    'parcelas',
    'parcelas_fatura_xor_data_propria_check',
    'CHECK ((fatura_id IS NOT NULL AND data_propria IS NULL) OR (fatura_id IS NULL AND data_propria IS NOT NULL))'
  );
  pgm.addConstraint('parcelas', 'parcelas_transacao_legado_id_unique', 'UNIQUE (transacao_legado_id)');

  pgm.createIndex('parcelas', 'compra_id');
  pgm.createIndex('parcelas', 'fatura_id', { where: 'fatura_id IS NOT NULL' });
  pgm.createIndex('parcelas', 'data_propria', { where: 'data_propria IS NOT NULL' });
  pgm.sql('ALTER TABLE parcelas ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('parcelas');
};
