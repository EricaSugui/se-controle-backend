exports.up = (pgm) => {
  pgm.addConstraint(
    'parcelas',
    'parcelas_transacao_legado_id_fkey',
    'FOREIGN KEY (transacao_legado_id) REFERENCES transacoes_legado(id) ON DELETE SET NULL'
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint('parcelas', 'parcelas_transacao_legado_id_fkey');
};
