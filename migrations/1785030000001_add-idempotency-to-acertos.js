exports.up = (pgm) => {
  pgm.addColumns('acertos', {
    idempotency_key: { type: 'varchar(255)', notNull: true },
  });
  pgm.addConstraint('acertos', 'acertos_casa_id_idempotency_key_unique', 'UNIQUE (casa_id, idempotency_key)');
};

exports.down = (pgm) => {
  pgm.dropConstraint('acertos', 'acertos_casa_id_idempotency_key_unique');
  pgm.dropColumns('acertos', ['idempotency_key']);
};
