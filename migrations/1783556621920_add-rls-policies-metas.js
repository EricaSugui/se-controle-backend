exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY metas_select ON metas
      FOR SELECT TO authenticated
      USING (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.participa_casa(casa_id))
      );

    CREATE POLICY metas_insert ON metas
      FOR INSERT TO authenticated
      WITH CHECK (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.admin_casa(casa_id))
      );

    CREATE POLICY metas_update ON metas
      FOR UPDATE TO authenticated
      USING (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.admin_casa(casa_id))
      )
      WITH CHECK (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.admin_casa(casa_id))
      );

    CREATE POLICY metas_delete ON metas
      FOR DELETE TO authenticated
      USING (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.admin_casa(casa_id))
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS metas_delete ON metas;
    DROP POLICY IF EXISTS metas_update ON metas;
    DROP POLICY IF EXISTS metas_insert ON metas;
    DROP POLICY IF EXISTS metas_select ON metas;
  `);
};
