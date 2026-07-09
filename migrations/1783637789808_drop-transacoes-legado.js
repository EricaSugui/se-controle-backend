// NÃO aplicar (npm run migrate:up) antes da PR #16 estar em main por tempo
// seguro (trava de segurança prudencial, não requisito técnico). Confirmado
// em 2026-07: zero referências no código a transacoes_legado/
// transacao_pagadores_legado ou ao FK parcelas.transacao_legado_id.

exports.up = (pgm) => {
  pgm.dropConstraint('parcelas', 'parcelas_transacao_legado_id_fkey');
  pgm.dropTable('transacao_pagadores_legado');
  pgm.dropTable('transacoes_legado');
  pgm.dropColumns('parcelas', ['transacao_legado_id']);
};

exports.down = (pgm) => {
  // recriação best-effort de estrutura — dados legados NÃO são restaurados
  pgm.addColumns('parcelas', {
    transacao_legado_id: { type: 'integer' },
  });
  pgm.createTable('transacoes_legado', { id: 'id' });
  pgm.createTable('transacao_pagadores_legado', { id: 'id' });
  pgm.addConstraint('parcelas', 'parcelas_transacao_legado_id_unique', 'UNIQUE (transacao_legado_id)');
  pgm.addConstraint(
    'parcelas',
    'parcelas_transacao_legado_id_fkey',
    'FOREIGN KEY (transacao_legado_id) REFERENCES transacoes_legado(id) ON DELETE SET NULL'
  );
};
