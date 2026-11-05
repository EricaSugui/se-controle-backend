exports.up = (pgm) => {
  pgm.createTable('onboarding_pessoas', {
    id: 'id',
    pessoa_id: {
      type: 'integer',
      notNull: true,
      unique: true,
      references: 'pessoas',
      onDelete: 'CASCADE',
    },
    perfil: { type: 'varchar(30)' },
    etapa_atual: { type: 'varchar(50)', notNull: true, default: 'intencao' },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'not_started',
      check: "status IN ('not_started', 'in_progress', 'dismissed', 'completed')",
    },
    dispensado_em: { type: 'timestamp' },
    concluido_em: { type: 'timestamp' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('onboarding_pessoas');
};
