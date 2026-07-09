exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY compras_select_membros ON compras
      FOR SELECT TO authenticated USING (private.participa_casa(casa_id));

    CREATE POLICY compras_insert_membros ON compras
      FOR INSERT TO authenticated WITH CHECK (private.participa_casa(casa_id));

    CREATE POLICY compras_update_dono_ou_admin ON compras
      FOR UPDATE TO authenticated
      USING (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id))
      WITH CHECK (
        private.participa_casa(casa_id)
        AND (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id))
      );

    CREATE POLICY compras_delete_dono_ou_admin ON compras
      FOR DELETE TO authenticated
      USING (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS compras_delete_dono_ou_admin ON compras;
    DROP POLICY IF EXISTS compras_update_dono_ou_admin ON compras;
    DROP POLICY IF EXISTS compras_insert_membros ON compras;
    DROP POLICY IF EXISTS compras_select_membros ON compras;
  `);
};
