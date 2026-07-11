exports.up = (pgm) => {
  pgm.addColumn('pessoas', {
    admin_sistema: { type: 'boolean', notNull: true, default: false },
  });

  pgm.sql(`
    CREATE OR REPLACE FUNCTION private.admin_sistema()
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT COALESCE(
        (SELECT admin_sistema FROM public.pessoas WHERE supabase_user_id = auth.uid()),
        false
      );
    $$;

    GRANT EXECUTE ON FUNCTION private.admin_sistema() TO authenticated;

    CREATE POLICY categorias_insert_admin_sistema ON categorias
      FOR INSERT TO authenticated WITH CHECK (private.admin_sistema());
    CREATE POLICY categorias_update_admin_sistema ON categorias
      FOR UPDATE TO authenticated USING (private.admin_sistema()) WITH CHECK (private.admin_sistema());

    CREATE POLICY formas_pagamento_insert_admin_sistema ON formas_pagamento
      FOR INSERT TO authenticated WITH CHECK (private.admin_sistema());
    CREATE POLICY formas_pagamento_update_admin_sistema ON formas_pagamento
      FOR UPDATE TO authenticated USING (private.admin_sistema()) WITH CHECK (private.admin_sistema());

    CREATE POLICY origens_receita_insert_admin_sistema ON origens_receita
      FOR INSERT TO authenticated WITH CHECK (private.admin_sistema());
    CREATE POLICY origens_receita_update_admin_sistema ON origens_receita
      FOR UPDATE TO authenticated USING (private.admin_sistema()) WITH CHECK (private.admin_sistema());
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS origens_receita_update_admin_sistema ON origens_receita;
    DROP POLICY IF EXISTS origens_receita_insert_admin_sistema ON origens_receita;
    DROP POLICY IF EXISTS formas_pagamento_update_admin_sistema ON formas_pagamento;
    DROP POLICY IF EXISTS formas_pagamento_insert_admin_sistema ON formas_pagamento;
    DROP POLICY IF EXISTS categorias_update_admin_sistema ON categorias;
    DROP POLICY IF EXISTS categorias_insert_admin_sistema ON categorias;
    DROP FUNCTION IF EXISTS private.admin_sistema();
  `);

  pgm.dropColumn('pessoas', 'admin_sistema');
};
