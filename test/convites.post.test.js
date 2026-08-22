const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

function carregarRouter({ pessoa, convite }) {
  const chamadasSupabase = [];
  const dbPath = require.resolve('../src/db');
  const authPath = require.resolve('../src/middleware/auth');
  const supabasePath = require.resolve('../src/config/supabase');
  const routePath = require.resolve('../src/routes/convites');

  delete require.cache[routePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    __esModule: true,
    default: {
      query: async (sql, params = []) => {
        if (sql.includes('FROM casa_pessoas WHERE')) return { rows: [{ ok: 1 }] };
        if (sql.includes('FROM pessoas WHERE LOWER(email)')) return { rows: pessoa ? [pessoa] : [] };
        if (sql.includes('JOIN pessoas p')) return { rows: [] };
        if (sql.includes('FROM convites') && sql.includes("status = 'pendente'")) return { rows: [] };
        if (sql.includes('INSERT INTO convites')) return { rows: [convite] };
        if (sql.includes('SELECT nome FROM casas')) return { rows: [{ nome: 'Casa teste' }] };
        if (sql.includes('SELECT nome FROM pessoas')) return { rows: [{ nome: 'Admin teste' }] };
        throw new Error(`Query nao esperada: ${sql}`);
      },
    },
  }};
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
    autenticar: (req, _res, next) => { req.usuario = { id: 7, email: 'admin@email.com' }; next(); },
  }};
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: {
    inviteSupabaseUser: async (...args) => { chamadasSupabase.push(args); },
    getSupabaseUser: async () => null,
  }};

  return { router: require('../src/routes/convites').default, chamadasSupabase };
}

async function post(router) {
  const app = express();
  app.use(express.json());
  app.use('/convites', router);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const resposta = await fetch(`http://127.0.0.1:${port}/convites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer teste' },
      body: JSON.stringify({ email: '  Pessoa@Email.Com ', casa_id: 2, papel: 'membro' }),
    });
    return { status: resposta.status, body: await resposta.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('POST /convites entrega no dashboard para pessoa com login', async () => {
  const convite = { id: 12, email: 'pessoa@email.com', casa_id: 2, papel: 'membro', status: 'pendente', token: 'secreto' };
  const { router, chamadasSupabase } = carregarRouter({ pessoa: { id: 22, supabase_user_id: 'uuid' }, convite });

  const resposta = await post(router);

  assert.equal(resposta.status, 201);
  assert.equal(resposta.body.email, 'pessoa@email.com');
  assert.equal(resposta.body.entrega, 'dashboard');
  assert.equal(resposta.body.token, undefined);
  assert.equal(chamadasSupabase.length, 0);
});

test('POST /convites envia onboarding para pessoa sem login', async () => {
  const convite = { id: 13, email: 'pessoa@email.com', casa_id: 2, papel: 'membro', status: 'pendente', token: 'secreto' };
  const { router, chamadasSupabase } = carregarRouter({ pessoa: null, convite });

  const resposta = await post(router);

  assert.equal(resposta.status, 201);
  assert.equal(resposta.body.entrega, 'email_onboarding');
  assert.equal(chamadasSupabase.length, 1);
  assert.equal(chamadasSupabase[0][0], 'pessoa@email.com');
});
