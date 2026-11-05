exports.up = (pgm) => {
  pgm.addColumn('pessoas', {
    casa_principal_id: {
      type: 'integer',
      references: 'casas',
      onDelete: 'SET NULL',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('pessoas', 'casa_principal_id');
};
