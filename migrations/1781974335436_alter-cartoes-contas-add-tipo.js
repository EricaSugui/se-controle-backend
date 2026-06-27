exports.up = (pgm) => {
  pgm.addColumns('cartoes_contas', {
    tipo: {
      type: 'varchar(10)',
      notNull: true,
      default: 'credito',
      check: "tipo IN ('credito', 'debito')",
    },
  });

  // remove default após popular linhas existentes
  pgm.sql('ALTER TABLE cartoes_contas ALTER COLUMN tipo DROP DEFAULT');

  pgm.dropColumns('cartoes_contas', ['dias_para_pagar']);
};

exports.down = (pgm) => {
  pgm.dropColumns('cartoes_contas', ['tipo']);

  pgm.addColumns('cartoes_contas', {
    dias_para_pagar: { type: 'smallint' },
  });
};
