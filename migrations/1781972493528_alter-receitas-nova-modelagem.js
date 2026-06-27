exports.up = (pgm) => {
  // remove dados de teste para permitir NOT NULL em casa_id
  pgm.sql('DELETE FROM receitas');

  pgm.dropColumns('receitas', ['origem', 'tipo', 'mes', 'ano']);

  pgm.addColumns('receitas', {
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'RESTRICT' },
    lancado_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    origem_id: { type: 'integer', references: 'origens_receita', onDelete: 'RESTRICT' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('receitas', ['casa_id', 'lancado_por_id', 'origem_id']);

  pgm.addColumns('receitas', {
    origem: { type: 'varchar(100)' },
    tipo: { type: 'varchar(100)' },
    mes: { type: 'varchar(10)' },
    ano: { type: 'integer' },
  });
};
