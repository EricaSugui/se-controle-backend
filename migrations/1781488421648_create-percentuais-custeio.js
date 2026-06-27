exports.up = (pgm) => {
  pgm.createTable('percentuais_custeio', {
    id: 'id',
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'CASCADE' },
    competencia: { type: 'varchar(10)', notNull: true },
    data_referencia: { type: 'date', notNull: true },
    percentual: { type: 'numeric(5,2)', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('percentuais_custeio', ['casa_id', 'data_referencia']);
};

exports.down = (pgm) => {
  pgm.dropTable('percentuais_custeio');
};
