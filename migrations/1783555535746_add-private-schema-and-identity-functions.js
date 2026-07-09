exports.up = (pgm) => {
  pgm.sql(`
    CREATE SCHEMA IF NOT EXISTS private;
    REVOKE ALL ON SCHEMA private FROM PUBLIC;
    GRANT USAGE ON SCHEMA private TO authenticated;

    CREATE OR REPLACE FUNCTION private.pessoa_id()
    RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT id FROM public.pessoas WHERE supabase_user_id = auth.uid(); $$;

    CREATE OR REPLACE FUNCTION private.participa_casa(p_casa_id integer)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.casa_pessoas
        WHERE casa_id = p_casa_id AND pessoa_id = private.pessoa_id()
      );
    $$;

    CREATE OR REPLACE FUNCTION private.admin_casa(p_casa_id integer)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.casa_pessoas
        WHERE casa_id = p_casa_id AND pessoa_id = private.pessoa_id() AND papel = 'admin'
      );
    $$;

    CREATE OR REPLACE FUNCTION private.mesma_casa(p_pessoa_id integer)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.casa_pessoas cp1
        JOIN public.casa_pessoas cp2 ON cp2.casa_id = cp1.casa_id
        WHERE cp1.pessoa_id = p_pessoa_id AND cp2.pessoa_id = private.pessoa_id()
      );
    $$;

    GRANT EXECUTE ON FUNCTION private.pessoa_id() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.participa_casa(integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.admin_casa(integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.mesma_casa(integer) TO authenticated;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP FUNCTION IF EXISTS private.mesma_casa(integer);
    DROP FUNCTION IF EXISTS private.admin_casa(integer);
    DROP FUNCTION IF EXISTS private.participa_casa(integer);
    DROP FUNCTION IF EXISTS private.pessoa_id();
    DROP SCHEMA IF EXISTS private;
  `);
};
