exports.up = (pgm) => {
  pgm.createTable('receitas_fixas', {
    id: 'id',
    casa_id: { type: 'integer', references: 'casas', onDelete: 'RESTRICT' },
    pessoa_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    origem_id: { type: 'integer', notNull: true, references: 'origens_receita', onDelete: 'RESTRICT' },
    descricao: { type: 'varchar(255)', notNull: true },
    tipo_confiabilidade: { type: 'varchar(10)', notNull: true, check: "tipo_confiabilidade IN ('fixa', 'variavel')" },
    valor_esperado: { type: 'numeric(12,2)' },
    periodicidade: { type: 'varchar(10)', notNull: true, check: "periodicidade IN ('mensal', 'anual')" },
    dia_esperado_recebimento: { type: 'smallint', notNull: true, check: 'dia_esperado_recebimento BETWEEN 1 AND 31' },
    vigente_desde: { type: 'date', notNull: true },
    vigente_ate: { type: 'date' },
    receita_fixa_anterior_id: { type: 'integer', references: 'receitas_fixas', onDelete: 'RESTRICT' },
    lancado_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint(
    'receitas_fixas',
    'receitas_fixas_pessoa_ou_casa_check',
    'CHECK ((pessoa_id IS NOT NULL AND casa_id IS NULL) OR (pessoa_id IS NULL AND casa_id IS NOT NULL))'
  );
  pgm.addConstraint(
    'receitas_fixas',
    'receitas_fixas_vigencia_check',
    'CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_desde)'
  );

  pgm.createIndex('receitas_fixas', 'casa_id');
  pgm.createIndex('receitas_fixas', 'pessoa_id');
  pgm.sql('ALTER TABLE receitas_fixas ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('receitas_fixas');
};
