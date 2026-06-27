exports.up = (pgm) => {
  pgm.createTable('metas', {
    id: 'id',
    objetivo: { type: 'varchar(100)', notNull: true },
    valor_atual: { type: 'numeric(12,2)', notNull: true, default: 0 },
    meta: { type: 'numeric(12,2)' },
    falta: { type: 'numeric(12,2)' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('metas');
};
