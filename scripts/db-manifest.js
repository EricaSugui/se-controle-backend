// Retrato de um banco para conferência de backup/restauração: versão do
// Postgres, última migration aplicada e contagem de linhas por tabela dos
// schemas da aplicação (public) e de autenticação (auth.users).
//
// Uso (a URL vem SEMPRE de variável de ambiente, nunca de argumento, para
// não aparecer em listas de processos nem em logs):
//
//   DB_MANIFEST_URL=postgresql://... node scripts/db-manifest.js [ambiente]
//
// Imprime JSON no stdout. Não carrega nenhum `.env`.

const { Client } = require('pg');

async function main() {
  const url = process.env.DB_MANIFEST_URL;
  if (!url) {
    console.error('DB_MANIFEST_URL não definida');
    process.exit(1);
  }
  const ambiente = process.argv[2] ?? 'desconhecido';
  const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows: [versao] } = await client.query('SHOW server_version');

    const { rows: [migracao] } = await client.query(`
      SELECT CASE WHEN to_regclass('public.pgmigrations') IS NULL THEN NULL
             ELSE (SELECT name FROM public.pgmigrations ORDER BY run_on DESC, id DESC LIMIT 1)
             END AS ultima`);

    const { rows: tabelas } = await client.query(`
      SELECT schemaname, tablename FROM pg_tables
      WHERE schemaname = 'public'
         OR (schemaname = 'auth' AND tablename = 'users')
      ORDER BY schemaname, tablename`);

    const contagens = {};
    for (const { schemaname, tablename } of tabelas) {
      const nome = `${schemaname}.${tablename}`;
      const { rows: [r] } = await client.query(
        `SELECT count(*)::int AS n FROM ${client.escapeIdentifier(schemaname)}.${client.escapeIdentifier(tablename)}`
      );
      contagens[nome] = r.n;
    }

    const manifesto = {
      ambiente,
      gerado_em: new Date().toISOString(),
      postgres: versao.server_version,
      ultima_migration: migracao.ultima,
      tabelas: Object.keys(contagens).length,
      linhas_total: Object.values(contagens).reduce((a, b) => a + b, 0),
      contagens,
    };
    process.stdout.write(JSON.stringify(manifesto, null, 2) + '\n');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  // Mensagem de erro do pg não inclui a senha, mas evitamos repassar a URL.
  console.error('Erro ao gerar manifesto:', e.message);
  process.exit(1);
});
