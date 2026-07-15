// Alerta do linter do Supabase (RLS Enabled No Policy) em convites e
// pgmigrations. Nos dois casos o deny-all é INTENCIONAL — estas policies
// explícitas de negação documentam isso e silenciam o alerta sem abrir nada:
//
// - convites: fluxo exclusivamente do backend. A coluna token é secreta (o
//   backend a omite de todas as respostas) e RLS é por linha, não por coluna
//   — qualquer policy de SELECT exporia tokens via PostgREST. Além disso, o
//   fluxo de aceitação atende convidados que ainda não têm pessoa vinculada,
//   inexpressável em RLS.
// - pgmigrations: tabela interna do node-pg-migrate (infraestrutura), nunca
//   deve ser acessível pela API.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY convites_backend_only ON convites
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
    CREATE POLICY pgmigrations_backend_only ON pgmigrations
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS pgmigrations_backend_only ON pgmigrations;
    DROP POLICY IF EXISTS convites_backend_only ON convites;
  `);
};
