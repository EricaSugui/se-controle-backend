exports.up = (pgm) => {
  pgm.addColumn('pessoas', {
    fuso_horario: { type: 'varchar(64)', notNull: true, default: 'America/Sao_Paulo' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('pessoas', 'fuso_horario');
};
