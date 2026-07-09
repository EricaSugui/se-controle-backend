exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY cartoes_contas_select ON cartoes_contas
      FOR SELECT TO authenticated
      USING (
        titular_id = private.pessoa_id()
        OR EXISTS (
          SELECT 1 FROM cartao_casa_visibilidade v
          WHERE v.cartao_id = cartoes_contas.id AND v.compartilhado = true AND private.participa_casa(v.casa_id)
        )
      );

    CREATE POLICY cartoes_contas_insert_titular ON cartoes_contas
      FOR INSERT TO authenticated WITH CHECK (titular_id = private.pessoa_id());

    CREATE POLICY cartoes_contas_update_titular ON cartoes_contas
      FOR UPDATE TO authenticated
      USING (titular_id = private.pessoa_id()) WITH CHECK (titular_id = private.pessoa_id());

    CREATE POLICY cartoes_contas_delete_titular ON cartoes_contas
      FOR DELETE TO authenticated USING (titular_id = private.pessoa_id());

    CREATE POLICY cartao_casa_visibilidade_select_membros ON cartao_casa_visibilidade
      FOR SELECT TO authenticated USING (private.participa_casa(casa_id));

    CREATE POLICY cartao_casa_visibilidade_insert_titular ON cartao_casa_visibilidade
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = cartao_id AND cc.titular_id = private.pessoa_id()));

    CREATE POLICY cartao_casa_visibilidade_update_titular ON cartao_casa_visibilidade
      FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = cartao_casa_visibilidade.cartao_id AND cc.titular_id = private.pessoa_id()))
      WITH CHECK (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = cartao_id AND cc.titular_id = private.pessoa_id()));

    CREATE POLICY cartao_casa_visibilidade_delete_titular ON cartao_casa_visibilidade
      FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM cartoes_contas cc WHERE cc.id = cartao_casa_visibilidade.cartao_id AND cc.titular_id = private.pessoa_id()));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS cartao_casa_visibilidade_delete_titular ON cartao_casa_visibilidade;
    DROP POLICY IF EXISTS cartao_casa_visibilidade_update_titular ON cartao_casa_visibilidade;
    DROP POLICY IF EXISTS cartao_casa_visibilidade_insert_titular ON cartao_casa_visibilidade;
    DROP POLICY IF EXISTS cartao_casa_visibilidade_select_membros ON cartao_casa_visibilidade;
    DROP POLICY IF EXISTS cartoes_contas_delete_titular ON cartoes_contas;
    DROP POLICY IF EXISTS cartoes_contas_update_titular ON cartoes_contas;
    DROP POLICY IF EXISTS cartoes_contas_insert_titular ON cartoes_contas;
    DROP POLICY IF EXISTS cartoes_contas_select ON cartoes_contas;
  `);
};
