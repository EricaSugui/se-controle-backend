exports.up = (pgm) => {
  pgm.sql('DELETE FROM metas');

  pgm.addColumns('metas', {
    pessoa_id: { type: 'integer', references: 'pessoas', onDelete: 'CASCADE' },
    casa_id: { type: 'integer', references: 'casas', onDelete: 'CASCADE' },
  });

  pgm.addConstraint(
    'metas',
    'metas_pessoa_ou_casa_check',
    'CHECK ((pessoa_id IS NOT NULL AND casa_id IS NULL) OR (pessoa_id IS NULL AND casa_id IS NOT NULL))'
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint('metas', 'metas_pessoa_ou_casa_check');
  pgm.dropColumns('metas', ['pessoa_id', 'casa_id']);
};
