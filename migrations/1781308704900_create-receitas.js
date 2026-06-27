exports.up = (pgm) => {
  pgm.createTable('receitas', {
    id: 'id',
    data: { type: 'date' },
    origem: { type: 'varchar(100)' },
    pessoa_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    tipo: { type: 'varchar(100)' },
    mes: { type: 'varchar(10)' },
    ano: { type: 'integer' },
    observacao: { type: 'varchar(255)' },
    valor_bruto: { type: 'numeric(12,2)' },
    descontos: { type: 'numeric(12,2)' },
    valor_liquido: { type: 'numeric(12,2)', notNull: true },
    competencia: { type: 'varchar(10)' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('receitas', 'competencia');
};

exports.down = (pgm) => {
  pgm.dropTable('receitas');
};
