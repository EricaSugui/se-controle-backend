exports.up = (pgm) => {
  pgm.createTable('despesas_fixas', {
    id: 'id',
    casa_id: { type: 'integer', references: 'casas', onDelete: 'RESTRICT' },
    pessoa_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    categoria_id: { type: 'integer', notNull: true, references: 'categorias', onDelete: 'RESTRICT' },
    descricao: { type: 'varchar(255)', notNull: true },
    tipo_valor: { type: 'varchar(20)', notNull: true, check: "tipo_valor IN ('fixo', 'variavel_estimado')" },
    valor_referencia: { type: 'numeric(12,2)', notNull: true },
    periodicidade: { type: 'varchar(10)', notNull: true, check: "periodicidade IN ('mensal', 'anual')" },
    dia_esperado: { type: 'smallint', notNull: true, check: 'dia_esperado BETWEEN 1 AND 31' },
    vigente_desde: { type: 'date', notNull: true },
    vigente_ate: { type: 'date' },
    despesa_fixa_anterior_id: { type: 'integer', references: 'despesas_fixas', onDelete: 'RESTRICT' },
    lancado_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint(
    'despesas_fixas',
    'despesas_fixas_pessoa_ou_casa_check',
    'CHECK ((pessoa_id IS NOT NULL AND casa_id IS NULL) OR (pessoa_id IS NULL AND casa_id IS NOT NULL))'
  );
  pgm.addConstraint(
    'despesas_fixas',
    'despesas_fixas_vigencia_check',
    'CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_desde)'
  );

  pgm.createIndex('despesas_fixas', 'casa_id');
  pgm.createIndex('despesas_fixas', 'pessoa_id');
  pgm.sql('ALTER TABLE despesas_fixas ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('despesas_fixas');
};
