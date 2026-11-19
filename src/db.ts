import { Pool, types } from 'pg';

// NUMERIC (OID 1700) vem como string por padrão; o contrato da API declara number.
types.setTypeParser(1700, (value) => parseFloat(value));

// O Supabase local do DEV (127.0.0.1/localhost) não aceita SSL; os bancos
// da nuvem (PROD e TCC) usam SSL como sempre.
const bancoLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: bancoLocal ? false : { rejectUnauthorized: false },
});

export default pool;
