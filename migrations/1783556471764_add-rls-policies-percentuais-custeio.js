exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY percentuais_custeio_select_membros ON percentuais_custeio
      FOR SELECT TO authenticated USING (private.participa_casa(casa_id));

    CREATE POLICY percentuais_custeio_insert_admin ON percentuais_custeio
      FOR INSERT TO authenticated WITH CHECK (private.admin_casa(casa_id));

    CREATE POLICY percentuais_custeio_update_admin ON percentuais_custeio
      FOR UPDATE TO authenticated
      USING (private.admin_casa(casa_id)) WITH CHECK (private.admin_casa(casa_id));

    CREATE POLICY percentuais_custeio_delete_admin ON percentuais_custeio
      FOR DELETE TO authenticated USING (private.admin_casa(casa_id));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS percentuais_custeio_delete_admin ON percentuais_custeio;
    DROP POLICY IF EXISTS percentuais_custeio_update_admin ON percentuais_custeio;
    DROP POLICY IF EXISTS percentuais_custeio_insert_admin ON percentuais_custeio;
    DROP POLICY IF EXISTS percentuais_custeio_select_membros ON percentuais_custeio;
  `);
};
