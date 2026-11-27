-- Compatibilidade mínima com o Supabase, para as migrations do produto
-- rodarem num Postgres puro (banco de medição do experimento).
--
-- As migrations de RLS concedem permissões ao papel `authenticated` e
-- usam `auth.uid()` nas políticas. No experimento ninguém acessa pelo
-- PostgREST: o harness conecta como `postgres`, que ignora RLS. Por isso
-- basta que esses objetos existam; o comportamento deles não é medido.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

-- Mesmo contrato do Supabase: o `sub` do JWT da requisição, ou nulo.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
