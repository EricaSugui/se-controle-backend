exports.up = (pgm) => {
  pgm.createTable('transacao_pagadores', {
    id: 'id',
    transacao_id: { type: 'integer', notNull: true, references: 'transacoes', onDelete: 'CASCADE' },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    percentual: { type: 'numeric(5,2)' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint(
    'transacao_pagadores',
    'transacao_pagadores_transacao_id_pessoa_id_unique',
    'UNIQUE (transacao_id, pessoa_id)'
  );
};

exports.down = (pgm) => {
  pgm.dropTable('transacao_pagadores');
};
