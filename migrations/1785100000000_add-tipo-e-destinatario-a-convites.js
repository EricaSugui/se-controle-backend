exports.up = (pgm) => {
  pgm.addColumn('convites', {
    tipo: {
      type: 'varchar(20)',
      notNull: true,
      default: 'email',
      check: "tipo IN ('email', 'interno')",
    },
  });

  pgm.addColumn('convites', {
    destinatario_pessoa_id: {
      type: 'integer',
      references: 'pessoas',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('convites', ['destinatario_pessoa_id', 'status']);
};

exports.down = (pgm) => {
  pgm.dropIndex('convites', ['destinatario_pessoa_id', 'status']);
  pgm.dropColumns('convites', ['destinatario_pessoa_id', 'tipo']);
};
