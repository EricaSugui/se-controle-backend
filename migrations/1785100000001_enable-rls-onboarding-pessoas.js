// A tabela onboarding_pessoas (1785030000006) foi criada sem RLS. Como o
// schema public fica exposto pela API REST do Supabase e a chave anon é
// pública no app, qualquer pessoa conseguia ler, alterar e apagar linhas
// dela. Alerta do Supabase "rls_disabled_in_public" em PROD, 22/11/2026.
//
// Sem policies, como as demais tabelas acessadas só pelo backend: anon e
// authenticated ficam sem acesso, e o backend (dono da tabela, via
// DATABASE_URL) não é afetado. ENABLE é idempotente.

exports.up = (pgm) => {
  pgm.sql('ALTER TABLE onboarding_pessoas ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE onboarding_pessoas DISABLE ROW LEVEL SECURITY;');
};
