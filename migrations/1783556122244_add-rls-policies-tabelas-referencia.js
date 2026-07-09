exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY casas_select_authenticated ON casas FOR SELECT TO authenticated USING (true);
    CREATE POLICY categorias_select_authenticated ON categorias FOR SELECT TO authenticated USING (true);
    CREATE POLICY formas_pagamento_select_authenticated ON formas_pagamento FOR SELECT TO authenticated USING (true);
    CREATE POLICY origens_receita_select_authenticated ON origens_receita FOR SELECT TO authenticated USING (true);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS origens_receita_select_authenticated ON origens_receita;
    DROP POLICY IF EXISTS formas_pagamento_select_authenticated ON formas_pagamento;
    DROP POLICY IF EXISTS categorias_select_authenticated ON categorias;
    DROP POLICY IF EXISTS casas_select_authenticated ON casas;
  `);
};
