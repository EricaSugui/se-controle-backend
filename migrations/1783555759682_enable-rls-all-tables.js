const TABELAS = [
  'pessoas', 'casas', 'casa_pessoas', 'categorias', 'formas_pagamento',
  'origens_receita', 'transacoes', 'receitas', 'percentuais_custeio',
  'cartoes_contas', 'metas', 'transacao_pagadores', 'convites', 'pgmigrations',
];

exports.up = (pgm) => {
  for (const tabela of TABELAS) {
    pgm.sql(`ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY;`);
  }
};

exports.down = (pgm) => {
  for (const tabela of TABELAS) {
    pgm.sql(`ALTER TABLE ${tabela} DISABLE ROW LEVEL SECURITY;`);
  }
};
