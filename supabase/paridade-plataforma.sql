-- Paridade do DEV local com a plataforma Supabase (nuvem).
--
-- Event trigger `ensure_rls`: liga Row Level Security automaticamente em
-- toda tabela nova do schema public (inclusive as criadas por migrations).
-- Ele não vem das migrations do projeto e o Supabase local não o cria.
--
-- Onde existe:
-- - TCC: criado pela plataforma Supabase.
-- - PROD: NÃO existia. Por isso onboarding_pessoas nasceu sem RLS (alerta
--   rls_disabled_in_public, 22/11/2026). Este arquivo foi rodado à mão no
--   SQL Editor de PROD em 25/11/2026; desde então o trigger está ativo.
-- - DEV local: aplicado por `npm run supabase:start` ANTES das migrations.
--
-- O trigger é só uma segunda proteção. A principal é o teste
-- src/migrations.rls.test.ts, que exige ENABLE ROW LEVEL SECURITY nas
-- próprias migrations (o trigger esconderia a falta no DEV e no TCC).
--
-- Definição copiada do TCC (função public.rls_auto_enable) e do guia
-- oficial: https://supabase.com/docs/guides/database/postgres/event-triggers
--
-- Idempotente: pode ser rodado de novo em qualquer ambiente.

CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END $$;
