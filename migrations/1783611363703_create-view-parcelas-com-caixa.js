exports.up = (pgm) => {
  pgm.sql(`
    CREATE VIEW parcelas_com_caixa AS
    SELECT
      p.id, p.compra_id, p.numero_parcela, p.valor, p.fatura_id, p.data_propria, p.transacao_legado_id,
      c.casa_id, c.pessoa_id, c.categoria_id, c.descricao, c.cartao_conta_id, c.forma_pagamento_id,
      c.data AS data_compra, c.competencia AS competencia_compra, c.lancado_por_id,
      f.mes_referencia AS fatura_mes_referencia, f.data_vencimento AS fatura_data_vencimento,
      COALESCE(f.data_vencimento, p.data_propria) AS data_caixa
    FROM parcelas p
    JOIN compras c ON c.id = p.compra_id
    LEFT JOIN faturas f ON f.id = p.fatura_id;
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP VIEW IF EXISTS parcelas_com_caixa;');
};
