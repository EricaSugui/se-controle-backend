exports.up = (pgm) => {
  pgm.addColumns('transacoes', {
    lancado_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('transacoes', ['lancado_por_id']);
};
