exports.up = (pgm) => {
  pgm.dropConstraint('acerto_eventos', 'acerto_eventos_tipo_valido');
  pgm.addConstraint(
    'acerto_eventos',
    'acerto_eventos_tipo_valido',
    "CHECK (tipo IN ('confirmado', 'pdf_gerado', 'csv_gerado', 'pdf_erro', 'csv_erro', 'compartilhado'))"
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint('acerto_eventos', 'acerto_eventos_tipo_valido');
  pgm.addConstraint(
    'acerto_eventos',
    'acerto_eventos_tipo_valido',
    "CHECK (tipo IN ('confirmado', 'pdf_gerado', 'csv_gerado', 'compartilhado'))"
  );
};
