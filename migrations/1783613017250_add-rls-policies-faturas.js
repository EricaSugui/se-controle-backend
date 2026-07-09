exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY faturas_select_titular ON faturas
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = faturas.cartao_conta_id AND cc.titular_id = private.pessoa_id()));

    CREATE POLICY faturas_insert_titular ON faturas
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = cartao_conta_id AND cc.titular_id = private.pessoa_id()));

    CREATE POLICY faturas_update_titular ON faturas
      FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = faturas.cartao_conta_id AND cc.titular_id = private.pessoa_id()))
      WITH CHECK (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = cartao_conta_id AND cc.titular_id = private.pessoa_id()));

    CREATE POLICY faturas_delete_titular ON faturas
      FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = faturas.cartao_conta_id AND cc.titular_id = private.pessoa_id()));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS faturas_delete_titular ON faturas;
    DROP POLICY IF EXISTS faturas_update_titular ON faturas;
    DROP POLICY IF EXISTS faturas_insert_titular ON faturas;
    DROP POLICY IF EXISTS faturas_select_titular ON faturas;
  `);
};
