exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY parcelas_select ON parcelas
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM compras c WHERE c.id = parcelas.compra_id AND private.participa_casa(c.casa_id)));

    CREATE POLICY parcelas_insert ON parcelas
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_id AND private.participa_casa(c.casa_id)));

    CREATE POLICY parcelas_update ON parcelas
      FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM compras c WHERE c.id = parcelas.compra_id AND (c.lancado_por_id = private.pessoa_id() OR private.admin_casa(c.casa_id))))
      WITH CHECK (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_id AND (c.lancado_por_id = private.pessoa_id() OR private.admin_casa(c.casa_id))));

    CREATE POLICY parcelas_delete ON parcelas
      FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM compras c WHERE c.id = parcelas.compra_id AND (c.lancado_por_id = private.pessoa_id() OR private.admin_casa(c.casa_id))));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS parcelas_delete ON parcelas;
    DROP POLICY IF EXISTS parcelas_update ON parcelas;
    DROP POLICY IF EXISTS parcelas_insert ON parcelas;
    DROP POLICY IF EXISTS parcelas_select ON parcelas;
  `);
};
