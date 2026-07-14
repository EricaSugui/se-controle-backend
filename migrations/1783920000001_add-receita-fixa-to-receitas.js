exports.up = (pgm) => {
  pgm.addColumns('receitas', {
    receita_fixa_id: { type: 'integer', references: 'receitas_fixas', onDelete: 'RESTRICT' },
    competencia_referencia: { type: 'varchar(10)' },
  });

  // competencia_referencia só faz sentido apontando para uma receita fixa
  pgm.addConstraint(
    'receitas',
    'receitas_competencia_referencia_check',
    'CHECK (receita_fixa_id IS NOT NULL OR competencia_referencia IS NULL)'
  );

  // consulta exata da detecção de recebimentos (receita_fixa_id + competencia_referencia)
  pgm.createIndex('receitas', ['receita_fixa_id', 'competencia_referencia'], {
    where: 'receita_fixa_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('receitas', ['receita_fixa_id', 'competencia_referencia'], {
    where: 'receita_fixa_id IS NOT NULL',
  });
  pgm.dropConstraint('receitas', 'receitas_competencia_referencia_check');
  pgm.dropColumns('receitas', ['receita_fixa_id', 'competencia_referencia']);
};
