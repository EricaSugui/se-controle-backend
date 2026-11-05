exports.up = (pgm) => {
  pgm.addColumn('casas', {
    usa_custeio: { type: 'boolean', notNull: true, default: true },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('casas', 'usa_custeio');
};
