exports.up = (pgm) => {
  pgm.renameTable('transacoes', 'transacoes_legado');
  pgm.renameTable('transacao_pagadores', 'transacao_pagadores_legado');
};

exports.down = (pgm) => {
  pgm.renameTable('transacao_pagadores_legado', 'transacao_pagadores');
  pgm.renameTable('transacoes_legado', 'transacoes');
};
