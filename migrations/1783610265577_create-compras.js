exports.up = (pgm) => {
  pgm.createTable('compras', {
    id: 'id',
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'RESTRICT' },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    categoria_id: { type: 'integer', notNull: true, references: 'categorias', onDelete: 'RESTRICT' },
    descricao: { type: 'varchar(255)' },
    cartao_conta_id: { type: 'integer', references: 'cartoes_contas', onDelete: 'SET NULL' },
    forma_pagamento_id: { type: 'integer', references: 'formas_pagamento', onDelete: 'SET NULL' },
    data: { type: 'date', notNull: true },
    competencia: { type: 'varchar(10)', notNull: true },
    total_parcelas: { type: 'smallint', notNull: true, default: 1, check: 'total_parcelas >= 1' },
    lancado_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('compras', 'competencia');
  pgm.sql('ALTER TABLE compras ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('compras');
};
