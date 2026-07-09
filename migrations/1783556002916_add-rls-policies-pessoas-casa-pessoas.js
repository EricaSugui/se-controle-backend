exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY pessoas_select_mesma_casa ON pessoas
      FOR SELECT TO authenticated
      USING (supabase_user_id = auth.uid() OR private.mesma_casa(id));

    CREATE POLICY pessoas_update_propria ON pessoas
      FOR UPDATE TO authenticated
      USING (supabase_user_id = auth.uid())
      WITH CHECK (supabase_user_id = auth.uid());

    CREATE POLICY casa_pessoas_select_membros ON casa_pessoas
      FOR SELECT TO authenticated USING (private.participa_casa(casa_id));

    CREATE POLICY casa_pessoas_insert_admin ON casa_pessoas
      FOR INSERT TO authenticated WITH CHECK (private.admin_casa(casa_id));

    CREATE POLICY casa_pessoas_update_admin ON casa_pessoas
      FOR UPDATE TO authenticated
      USING (private.admin_casa(casa_id)) WITH CHECK (private.admin_casa(casa_id));

    CREATE POLICY casa_pessoas_delete_admin ON casa_pessoas
      FOR DELETE TO authenticated USING (private.admin_casa(casa_id));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS casa_pessoas_delete_admin ON casa_pessoas;
    DROP POLICY IF EXISTS casa_pessoas_update_admin ON casa_pessoas;
    DROP POLICY IF EXISTS casa_pessoas_insert_admin ON casa_pessoas;
    DROP POLICY IF EXISTS casa_pessoas_select_membros ON casa_pessoas;
    DROP POLICY IF EXISTS pessoas_update_propria ON pessoas;
    DROP POLICY IF EXISTS pessoas_select_mesma_casa ON pessoas;
  `);
};
