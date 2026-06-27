exports.up = (pgm) => {
  pgm.createTable('convites', {
    id: 'id',
    email: { type: 'varchar(255)', notNull: true },
    convidado_por_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    casa_id: { type: 'integer', references: 'casas', onDelete: 'CASCADE' },
    papel: {
      type: 'varchar(20)',
      check: "papel IN ('admin', 'membro')",
    },
    token: { type: 'varchar(64)', notNull: true, unique: true },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pendente',
      check: "status IN ('pendente', 'aceito', 'expirado')",
    },
    expires_at: { type: 'timestamp' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('convites', 'token');
  pgm.createIndex('convites', 'email');
};

exports.down = (pgm) => {
  pgm.dropTable('convites');
};
