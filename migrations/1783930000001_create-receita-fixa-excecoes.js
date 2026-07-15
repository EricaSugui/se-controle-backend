// Irmã de despesa_fixa_excecoes — ver decisão de design lá (tabelas irmãs,
// não genérica). Snapshot aqui é do valor_esperado do pai (que pode ser null
// em receitas de confiabilidade variável).

exports.up = (pgm) => {
  pgm.createTable('receita_fixa_excecoes', {
    id: 'id',
    receita_fixa_id: { type: 'integer', notNull: true, references: 'receitas_fixas', onDelete: 'RESTRICT' },
    competencia_referencia: { type: 'varchar(10)', notNull: true },
    valor_ocorrido: { type: 'numeric(12,2)' },
    valor_esperado_original: { type: 'numeric(12,2)' },
    motivo: { type: 'varchar(255)' },
    lancado_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint(
    'receita_fixa_excecoes',
    'receita_fixa_excecoes_competencia_unique',
    'UNIQUE (receita_fixa_id, competencia_referencia)'
  );

  pgm.sql('ALTER TABLE receita_fixa_excecoes ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('receita_fixa_excecoes');
};
