exports.up = (pgm) => {
  pgm.addColumns('pessoas', {
    email: { type: 'varchar(255)', unique: true },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('pessoas', ['email']);
};
