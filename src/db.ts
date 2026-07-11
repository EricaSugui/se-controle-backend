import { Pool, types } from 'pg';

// NUMERIC (OID 1700) vem como string por padrão; o contrato da API declara number.
types.setTypeParser(1700, (value) => parseFloat(value));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default pool;
