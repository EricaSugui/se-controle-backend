exports.up = (pgm) => {
  pgm.createTable('origens_receita', {
    id: 'id',
    nome: { type: 'varchar(100)', notNull: true, unique: true },
    ativo: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('origens_receita');
};
