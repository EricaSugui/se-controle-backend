require('dotenv').config();
const { Client } = require('pg');

const keepTables = new Set([
  'pgmigrations',
  'pessoas',
  'casas',
  'casa_pessoas',
  'cartoes_contas',
  'cartao_casa_visibilidade',
]);

function quoteIdentifier(identifier) {
  return '"' + identifier.replace(/"/g, '""') + '"';
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const tablesResult = await client.query(
      `
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `
    );

    const tablesToTruncate = tablesResult.rows
      .map((row) => row.tablename)
      .filter((tableName) => !keepTables.has(tableName));

    if (tablesToTruncate.length === 0) {
      console.log('Nenhuma tabela pública para limpar.');
      return;
    }

    console.log('Tabelas mantidas:', Array.from(keepTables).join(', '));
    console.log('Tabelas a limpar:', tablesToTruncate.join(', '));

    await client.query('BEGIN');
    await client.query(
      `TRUNCATE TABLE ${tablesToTruncate.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`
    );
    await client.query('COMMIT');

    console.log('Limpeza concluída com sucesso.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});