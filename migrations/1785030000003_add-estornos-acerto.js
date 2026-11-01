exports.up = (pgm) => {
  pgm.addColumns('compras', {
    status: { type: 'varchar(12)', notNull: true, default: 'ativa' },
    cancelada_em: { type: 'timestamp' },
    cancelada_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    cancelamento_motivo: { type: 'varchar(255)' },
  });
  pgm.addConstraint('compras', 'compras_status_valido', "CHECK (status IN ('ativa', 'cancelada'))");

  pgm.createTable('acerto_ajustes', {
    id: 'id',
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'RESTRICT' },
    origem_tipo: { type: 'varchar(20)', notNull: true },
    origem_id: { type: 'integer', notNull: true },
    tipo: { type: 'varchar(20)', notNull: true },
    de_pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    de_nome_snapshot: { type: 'varchar(100)', notNull: true },
    para_pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    para_nome_snapshot: { type: 'varchar(100)', notNull: true },
    valor: { type: 'numeric(14,2)', notNull: true },
    moeda: { type: 'varchar(3)', notNull: true, default: 'BRL' },
    data: { type: 'date', notNull: true },
    descricao: { type: 'varchar(255)', notNull: true },
    aplicado_em_acerto_id: { type: 'integer', references: 'acertos', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('acerto_ajustes', 'acerto_ajustes_tipo_valido', "CHECK (tipo = 'estorno')");
  pgm.addConstraint('acerto_ajustes', 'acerto_ajustes_pessoas_distintas', 'CHECK (de_pessoa_id <> para_pessoa_id)');
  pgm.addConstraint(
    'acerto_ajustes',
    'acerto_ajustes_origem_transferencia_unica',
    'UNIQUE (origem_tipo, origem_id, de_pessoa_id, para_pessoa_id)'
  );
  pgm.createIndex('acerto_ajustes', ['casa_id', 'aplicado_em_acerto_id']);
  pgm.sql('ALTER TABLE acerto_ajustes ENABLE ROW LEVEL SECURITY;');
  pgm.sql(`
    CREATE POLICY acerto_ajustes_select_membros ON acerto_ajustes
      FOR SELECT TO authenticated
      USING (private.participa_casa(casa_id));
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP POLICY IF EXISTS acerto_ajustes_select_membros ON acerto_ajustes;');
  pgm.dropTable('acerto_ajustes');
  pgm.dropConstraint('compras', 'compras_status_valido');
  pgm.dropColumns('compras', ['status', 'cancelada_em', 'cancelada_por_id', 'cancelamento_motivo']);
};
