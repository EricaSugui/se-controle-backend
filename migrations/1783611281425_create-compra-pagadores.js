exports.up = (pgm) => {
  pgm.createTable('compra_pagadores', {
    id: 'id',
    compra_id: { type: 'integer', notNull: true, references: 'compras', onDelete: 'CASCADE' },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    percentual: { type: 'numeric(5,2)' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('compra_pagadores', 'compra_pagadores_compra_id_pessoa_id_unique', 'UNIQUE (compra_id, pessoa_id)');
  pgm.createIndex('compra_pagadores', 'compra_id');
  pgm.createIndex('compra_pagadores', 'pessoa_id');
  pgm.sql('ALTER TABLE compra_pagadores ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('compra_pagadores');
};
