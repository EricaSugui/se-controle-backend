exports.up = (pgm) => {
  pgm.createTable('casa_pessoas', {
    id: 'id',
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'CASCADE' },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'CASCADE' },
    papel: {
      type: 'varchar(20)',
      notNull: true,
      default: 'membro',
      check: "papel IN ('admin', 'membro')",
    },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('casa_pessoas', 'casa_pessoas_casa_id_pessoa_id_unique', 'UNIQUE (casa_id, pessoa_id)');
};

exports.down = (pgm) => {
  pgm.dropTable('casa_pessoas');
};
