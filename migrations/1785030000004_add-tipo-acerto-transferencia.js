exports.up = (pgm) => {
  pgm.addColumns('acerto_transferencias', {
    tipo: { type: 'varchar(12)', notNull: true, default: 'pagamento' },
  });
  pgm.addConstraint(
    'acerto_transferencias',
    'acerto_transferencias_tipo_valido',
    "CHECK (tipo IN ('pagamento', 'estorno'))"
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint('acerto_transferencias', 'acerto_transferencias_tipo_valido');
  pgm.dropColumns('acerto_transferencias', ['tipo']);
};
