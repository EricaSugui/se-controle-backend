exports.up = (pgm) => {
  pgm.createTable('cartoes_contas', {
    id: 'id',
    nome: { type: 'varchar(100)', notNull: true },
    titular_id: { type: 'integer', references: 'pessoas', onDelete: 'SET NULL' },
    limite: { type: 'numeric(12,2)' },
    dia_fechamento: { type: 'smallint' },
    dia_vencimento: { type: 'smallint' },
    dias_para_pagar: { type: 'smallint' },
    ativo: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('cartoes_contas');
};
