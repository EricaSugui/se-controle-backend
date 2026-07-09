exports.up = (pgm) => {
  pgm.createTable('cartao_casa_visibilidade', {
    id: 'id',
    cartao_id: { type: 'integer', notNull: true, references: 'cartoes_contas', onDelete: 'CASCADE' },
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'CASCADE' },
    compartilhado: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint(
    'cartao_casa_visibilidade',
    'cartao_casa_visibilidade_cartao_id_casa_id_unique',
    'UNIQUE (cartao_id, casa_id)'
  );

  pgm.sql('ALTER TABLE cartao_casa_visibilidade ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('cartao_casa_visibilidade');
};
