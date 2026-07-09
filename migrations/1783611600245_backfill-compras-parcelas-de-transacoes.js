exports.up = (pgm) => {
  pgm.sql(`
    CREATE TEMP TABLE _stage_transacoes ON COMMIT DROP AS
    SELECT t.*,
      SUM(CASE WHEN COALESCE(t.parcela_atual, 1) = 1 THEN 1 ELSE 0 END)
        OVER (
          PARTITION BY t.pessoa_id, t.casa_id, t.categoria_id, t.cartao_conta_id,
                       t.descricao, t.forma_pagamento_id, t.valor_parcela, t.total_parcelas
          ORDER BY t.data, t.id ROWS UNBOUNDED PRECEDING
        ) AS episodio
    FROM transacoes t;
  `);

  pgm.sql(`
    CREATE TEMP TABLE _stage_grupo_compra ON COMMIT DROP AS
    SELECT ROW_NUMBER() OVER () AS grupo_id, gg.*
    FROM (
      SELECT
        pessoa_id, casa_id, categoria_id, cartao_conta_id, forma_pagamento_id, descricao,
        valor_parcela, COALESCE(total_parcelas, 1) AS total_parcelas, episodio,
        MIN(data) AS data_compra,
        (array_agg(competencia ORDER BY data, COALESCE(parcela_atual, 1)))[1] AS competencia,
        (array_agg(lancado_por_id ORDER BY data, COALESCE(parcela_atual, 1)))[1] AS lancado_por_id
      FROM _stage_transacoes
      GROUP BY pessoa_id, casa_id, categoria_id, cartao_conta_id, forma_pagamento_id, descricao,
               valor_parcela, COALESCE(total_parcelas, 1), episodio
    ) gg;
  `);

  pgm.sql(`ALTER TABLE compras ADD COLUMN _legado_grupo_id bigint;`);

  pgm.sql(`
    INSERT INTO compras (casa_id, pessoa_id, categoria_id, descricao, cartao_conta_id,
                          forma_pagamento_id, data, competencia, total_parcelas, lancado_por_id,
                          _legado_grupo_id)
    SELECT casa_id, pessoa_id, categoria_id, descricao, cartao_conta_id,
           forma_pagamento_id, data_compra, competencia, total_parcelas, lancado_por_id, grupo_id
    FROM _stage_grupo_compra;
  `);

  pgm.sql(`
    CREATE TEMP TABLE _stage_transacao_compra ON COMMIT DROP AS
    SELECT st.id AS transacao_id, c.id AS compra_id,
           COALESCE(st.parcela_atual, 1) AS numero_parcela, st.valor_parcela, st.data
    FROM _stage_transacoes st
    JOIN _stage_grupo_compra g
      ON g.pessoa_id = st.pessoa_id AND g.casa_id = st.casa_id AND g.categoria_id = st.categoria_id
     AND g.cartao_conta_id IS NOT DISTINCT FROM st.cartao_conta_id
     AND g.forma_pagamento_id IS NOT DISTINCT FROM st.forma_pagamento_id
     AND g.descricao IS NOT DISTINCT FROM st.descricao
     AND g.valor_parcela = st.valor_parcela AND g.total_parcelas = COALESCE(st.total_parcelas, 1)
     AND g.episodio = st.episodio
    JOIN compras c ON c._legado_grupo_id = g.grupo_id;
  `);

  pgm.sql(`ALTER TABLE compras DROP COLUMN _legado_grupo_id;`);

  pgm.sql(`
    INSERT INTO parcelas (compra_id, numero_parcela, valor, data_propria, transacao_legado_id)
    SELECT compra_id, numero_parcela, valor_parcela, data, transacao_id
    FROM _stage_transacao_compra;
  `);

  pgm.sql(`
    INSERT INTO compra_pagadores (compra_id, pessoa_id, percentual)
    SELECT DISTINCT ON (stc.compra_id, tp.pessoa_id) stc.compra_id, tp.pessoa_id, tp.percentual
    FROM transacao_pagadores tp
    JOIN _stage_transacao_compra stc ON stc.transacao_id = tp.transacao_id
    ORDER BY stc.compra_id, tp.pessoa_id, stc.data ASC, stc.numero_parcela ASC;
  `);
};

exports.down = (pgm) => {
  // Seguro só enquanto nada além deste backfill escreveu em compras/parcelas/compra_pagadores.
  pgm.sql('TRUNCATE TABLE compra_pagadores, parcelas, compras RESTART IDENTITY CASCADE;');
};
