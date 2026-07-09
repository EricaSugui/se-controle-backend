exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY receitas_select_membros ON receitas
      FOR SELECT TO authenticated USING (private.participa_casa(casa_id));

    CREATE POLICY receitas_insert_membros ON receitas
      FOR INSERT TO authenticated WITH CHECK (private.participa_casa(casa_id));

    CREATE POLICY receitas_update_dono_ou_admin ON receitas
      FOR UPDATE TO authenticated
      USING (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id))
      WITH CHECK (
        private.participa_casa(casa_id)
        AND (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id))
      );

    CREATE POLICY receitas_delete_dono_ou_admin ON receitas
      FOR DELETE TO authenticated
      USING (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS receitas_delete_dono_ou_admin ON receitas;
    DROP POLICY IF EXISTS receitas_update_dono_ou_admin ON receitas;
    DROP POLICY IF EXISTS receitas_insert_membros ON receitas;
    DROP POLICY IF EXISTS receitas_select_membros ON receitas;
  `);
};
