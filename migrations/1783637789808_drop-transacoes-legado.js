// NÃO aplicar (npm run migrate:up) antes da PR #16 estar em main por tempo
// seguro (trava de segurança prudencial, não requisito técnico). Confirmado
// em 2026-07: zero referências no código a transacoes_legado/
// transacao_pagadores_legado ou ao FK parcelas.transacao_legado_id.

// A view parcelas_com_caixa seleciona parcelas.transacao_legado_id, o que
// bloqueia o DROP da coluna — por isso a view é dropada e recriada sem ela.

const criarView = (colunaLegado) => `
  CREATE VIEW parcelas_com_caixa AS
  SELECT
    p.id, p.compra_id, p.numero_parcela, p.valor, p.fatura_id, p.data_propria,${colunaLegado}
    c.casa_id, c.pessoa_id, c.categoria_id, c.descricao, c.cartao_conta_id, c.forma_pagamento_id,
    c.data AS data_compra, c.competencia AS competencia_compra, c.lancado_por_id,
    f.mes_referencia AS fatura_mes_referencia, f.data_vencimento AS fatura_data_vencimento,
    COALESCE(f.data_vencimento, p.data_propria) AS data_caixa
  FROM parcelas p
  JOIN compras c ON c.id = p.compra_id
  LEFT JOIN faturas f ON f.id = p.fatura_id;
`;

exports.up = (pgm) => {
  pgm.sql('DROP VIEW parcelas_com_caixa;');
  pgm.dropConstraint('parcelas', 'parcelas_transacao_legado_id_fkey');
  pgm.dropTable('transacao_pagadores_legado');
  pgm.dropTable('transacoes_legado');
  pgm.dropColumns('parcelas', ['transacao_legado_id']);
  pgm.sql(criarView(''));
};

exports.down = (pgm) => {
  // recriação best-effort de estrutura — dados legados NÃO são restaurados
  pgm.sql('DROP VIEW parcelas_com_caixa;');
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
  pgm.sql(criarView(' p.transacao_legado_id,'));
};
