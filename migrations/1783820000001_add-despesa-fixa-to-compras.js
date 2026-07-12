exports.up = (pgm) => {
  pgm.addColumns('compras', {
    despesa_fixa_id: { type: 'integer', references: 'despesas_fixas', onDelete: 'RESTRICT' },
    competencia_referencia: { type: 'varchar(10)' },
  });

  // competencia_referencia só faz sentido apontando para uma despesa fixa
  pgm.addConstraint(
    'compras',
    'compras_competencia_referencia_check',
    'CHECK (despesa_fixa_id IS NOT NULL OR competencia_referencia IS NULL)'
  );

  // consulta exata do gap detection (despesa_fixa_id + competencia_referencia)
  pgm.createIndex('compras', ['despesa_fixa_id', 'competencia_referencia'], {
    where: 'despesa_fixa_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('compras', ['despesa_fixa_id', 'competencia_referencia'], {
    where: 'despesa_fixa_id IS NOT NULL',
  });
  pgm.dropConstraint('compras', 'compras_competencia_referencia_check');
  pgm.dropColumns('compras', ['despesa_fixa_id', 'competencia_referencia']);
};
