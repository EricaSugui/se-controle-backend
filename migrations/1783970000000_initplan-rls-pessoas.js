// Alerta de performance do linter do Supabase (auth_rls_initplan): auth.uid()
// chamado direto na expressão da policy é reavaliado POR LINHA; embrulhado em
// (SELECT auth.uid()) o Postgres avalia uma vez por query (InitPlan). As duas
// policies de pessoas eram as únicas com auth.uid() direto — as demais usam
// as funções private.*.

exports.up = (pgm) => {
  pgm.sql(`
    DROP POLICY pessoas_select_mesma_casa ON pessoas;
    CREATE POLICY pessoas_select_mesma_casa ON pessoas FOR SELECT TO authenticated
      USING (supabase_user_id = (SELECT auth.uid()) OR private.mesma_casa(id));

    DROP POLICY pessoas_update_propria ON pessoas;
    CREATE POLICY pessoas_update_propria ON pessoas FOR UPDATE TO authenticated
      USING (supabase_user_id = (SELECT auth.uid()))
      WITH CHECK (supabase_user_id = (SELECT auth.uid()));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY pessoas_update_propria ON pessoas;
    CREATE POLICY pessoas_update_propria ON pessoas FOR UPDATE TO authenticated
      USING (supabase_user_id = auth.uid())
      WITH CHECK (supabase_user_id = auth.uid());

    DROP POLICY pessoas_select_mesma_casa ON pessoas;
    CREATE POLICY pessoas_select_mesma_casa ON pessoas FOR SELECT TO authenticated
      USING (supabase_user_id = auth.uid() OR private.mesma_casa(id));
  `);
};
