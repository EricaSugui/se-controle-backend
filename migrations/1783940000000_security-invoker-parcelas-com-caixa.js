// Alerta do linter do Supabase (Security Definer View): a view executava com
// as permissões do dono (postgres, superuser), então consultas diretas via
// PostgREST por usuários autenticados ignoravam o RLS de compras/parcelas/
// faturas. Com security_invoker, a view avalia o RLS de quem consulta.
// O backend Express não muda: o pool é superuser e segue bypassando RLS.

exports.up = (pgm) => {
  pgm.sql('ALTER VIEW parcelas_com_caixa SET (security_invoker = true);');
};

exports.down = (pgm) => {
  pgm.sql('ALTER VIEW parcelas_com_caixa RESET (security_invoker);');
};
