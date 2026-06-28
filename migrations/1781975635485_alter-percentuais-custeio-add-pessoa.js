exports.up = (pgm) => {
  // remove índice antigo que usa data_referencia
  pgm.dropIndex('percentuais_custeio', ['casa_id', 'data_referencia']);

  pgm.dropColumns('percentuais_custeio', ['data_referencia']);

  pgm.addColumns('percentuais_custeio', {
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'CASCADE' },
  });

  pgm.addConstraint(
    'percentuais_custeio',
    'percentuais_custeio_casa_id_pessoa_id_competencia_unique',
    'UNIQUE (casa_id, pessoa_id, competencia)'
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint('percentuais_custeio', 'percentuais_custeio_casa_id_pessoa_id_competencia_unique');
  pgm.dropColumns('percentuais_custeio', ['pessoa_id']);
  pgm.addColumns('percentuais_custeio', {
    data_referencia: { type: 'date', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('percentuais_custeio', ['casa_id', 'data_referencia']);
};
