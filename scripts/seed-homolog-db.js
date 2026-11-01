require('dotenv').config();
const { Client } = require('pg');

const HOUSE_NAME = process.env.HML_FIXTURE_HOUSE_NAME || 'Casa Fixture HML';
const FIXTURES = [
  {
    key: 'admin',
    email: process.env.HML_FIXTURE_ADMIN_EMAIL || 'teste.admin@hml.example',
    password: process.env.HML_FIXTURE_ADMIN_PASSWORD,
    name: 'Admin Fixture HML',
    role: 'admin',
  },
  {
    key: 'member1',
    email: process.env.HML_FIXTURE_MEMBER1_EMAIL || 'teste.membro1@hml.example',
    password: process.env.HML_FIXTURE_MEMBER1_PASSWORD,
    name: 'Membro 1 Fixture HML',
    role: 'membro',
  },
  {
    key: 'member2',
    email: process.env.HML_FIXTURE_MEMBER2_EMAIL || 'teste.membro2@hml.example',
    password: process.env.HML_FIXTURE_MEMBER2_PASSWORD,
    name: 'Membro 2 Fixture HML',
    role: 'membro',
  },
];

function createClient() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatório para criar fixtures');
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

async function supabaseAdmin(path, options = {}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para criar fixtures');
  }
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) {
    throw new Error(`Supabase Auth ${response.status}: ${body.message || body.msg || text}`);
  }
  return body;
}

async function findAuthUser(email) {
  const body = await supabaseAdmin('/admin/users?page=1&per_page=1000');
  return (body.users || []).find((user) => user.email === email) || null;
}

async function ensureAuthUser(fixture) {
  let user = await findAuthUser(fixture.email);
  if (!user) {
    if (!fixture.password) {
      throw new Error(`Defina a senha ${fixture.key.toUpperCase()}_PASSWORD para criar ${fixture.email}`);
    }
    user = await supabaseAdmin('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: fixture.email,
        password: fixture.password,
        email_confirm: true,
        user_metadata: { nome: fixture.name, fixture: true },
      }),
    });
  } else if (fixture.password) {
    await supabaseAdmin(`/admin/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password: fixture.password,
        email_confirm: true,
        user_metadata: { nome: fixture.name, fixture: true },
      }),
    });
  }
  return user;
}

async function ensureNamedRow(client, table, name, extraColumns = '', extraValues = []) {
  const existing = await client.query(`SELECT id FROM "${table}" WHERE nome = $1 LIMIT 1`, [name]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const columns = ['nome', ...extraColumns ? extraColumns.split(',').map((column) => column.trim()) : []];
  const values = [name, ...extraValues];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  const result = await client.query(
    `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values,
  );
  return result.rows[0].id;
}

async function main() {
  const client = createClient();
  const users = [];
  for (const fixture of FIXTURES) {
    users.push({ ...fixture, auth: await ensureAuthUser(fixture) });
  }

  await client.connect();
  try {
    await client.query('BEGIN');
    const people = [];
    for (const fixture of users) {
      const result = await client.query(
        `INSERT INTO pessoas (nome, email, supabase_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (supabase_user_id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email
         RETURNING id`,
        [fixture.name, fixture.email, fixture.auth.id],
      );
      people.push({ ...fixture, pessoaId: result.rows[0].id });
    }

    const houseResult = await client.query(
      `INSERT INTO casas (nome)
       VALUES ($1)
       ON CONFLICT (nome) DO UPDATE SET ativo = true
       RETURNING id`,
      [HOUSE_NAME],
    );
    const houseId = houseResult.rows[0].id;

    for (const person of people) {
      await client.query(
        `INSERT INTO casa_pessoas (casa_id, pessoa_id, papel)
         VALUES ($1, $2, $3)
         ON CONFLICT (casa_id, pessoa_id) DO UPDATE SET papel = EXCLUDED.papel`,
        [houseId, person.pessoaId, person.role],
      );
    }

    const categoryId = await ensureNamedRow(client, 'categorias', 'Categoria Fixture HML');
    const paymentId = await ensureNamedRow(client, 'formas_pagamento', 'Pagamento Fixture HML');
    const originId = await ensureNamedRow(client, 'origens_receita', 'Origem Fixture HML');
    const accountResult = await client.query(
      `INSERT INTO cartoes_contas (nome, titular_id, tipo, saldo_base, saldo_base_data)
       SELECT 'Conta Fixture HML', $1, 'debito', 0, CURRENT_DATE
       WHERE NOT EXISTS (
         SELECT 1 FROM cartoes_contas WHERE nome = 'Conta Fixture HML' AND titular_id = $1
       )
       RETURNING id`,
      [people[0].pessoaId],
    );
    const accountId = accountResult.rows[0]?.id || (await client.query(
      'SELECT id FROM cartoes_contas WHERE nome = $1 AND titular_id = $2',
      ['Conta Fixture HML', people[0].pessoaId],
    )).rows[0].id;
    const cardResult = await client.query(
      `INSERT INTO cartoes_contas
        (nome, titular_id, tipo, limite, dia_fechamento, dia_vencimento)
       SELECT 'Cartão Fixture HML', $1, 'credito', 5000, 10, 20
       WHERE NOT EXISTS (
         SELECT 1 FROM cartoes_contas WHERE nome = 'Cartão Fixture HML' AND titular_id = $1
       )
       RETURNING id`,
      [people[0].pessoaId],
    );
    const cardId = cardResult.rows[0]?.id || (await client.query(
      'SELECT id FROM cartoes_contas WHERE nome = $1 AND titular_id = $2',
      ['Cartão Fixture HML', people[0].pessoaId],
    )).rows[0].id;

    await client.query(
      `INSERT INTO percentuais_custeio (casa_id, pessoa_id, competencia, percentual)
       VALUES ($1, $2, 'OUT-26', 50), ($1, $3, 'OUT-26', 30), ($1, $4, 'OUT-26', 20)
       ON CONFLICT (casa_id, pessoa_id, competencia)
       DO UPDATE SET percentual = EXCLUDED.percentual`,
      [houseId, people[0].pessoaId, people[1].pessoaId, people[2].pessoaId],
    );

    await client.query('COMMIT');
    console.log(JSON.stringify({
      houseId,
      people: people.map(({ key, pessoaId, email }) => ({ key, pessoaId, email })),
      categoryId,
      paymentId,
      originId,
      accountId,
      cardId,
    }));
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
