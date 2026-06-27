const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { getSupabaseUser, inviteSupabaseUser } = require('../config/supabase');

const router = express.Router();

const orNull = (value) => (value === undefined ? null : value);

router.get('/', async (req, res, next) => {
  try {
    const { status, email } = req.query;
    const params = [];
    let query = 'SELECT * FROM convites';
    const conditions = [];

    if (status !== undefined) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (email !== undefined) {
      params.push(email);
      conditions.push(`email = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/token/:token', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM convites WHERE token = $1',
      [req.params.token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Convite não encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Aceite completo via token — cria pessoa, vincula ao Supabase e entra na casa
router.patch('/token/:token/aceitar', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const supabaseUser = await getSupabaseUser(authHeader.slice(7));

    if (!supabaseUser || !supabaseUser.id) {
      return res.status(401).json({ erro: 'Token inválido ou expirado' });
    }

    const { rows: conviteRows } = await pool.query(
      'SELECT * FROM convites WHERE token = $1',
      [req.params.token]
    );

    if (conviteRows.length === 0) {
      return res.status(404).json({ erro: 'Convite não encontrado' });
    }

    const convite = conviteRows[0];

    if (convite.status !== 'pendente') {
      return res.status(409).json({ erro: 'Convite já utilizado ou expirado' });
    }

    if (convite.expires_at && new Date(convite.expires_at) < new Date()) {
      return res.status(409).json({ erro: 'Convite expirado' });
    }

    // garante que o email do Supabase bate com o do convite
    if (supabaseUser.email !== convite.email) {
      return res.status(403).json({ erro: 'Email do usuário não corresponde ao convite' });
    }

    // impede vincular se já existe pessoa com esse supabase_user_id
    const { rows: pessoaExistente } = await pool.query(
      'SELECT id FROM pessoas WHERE supabase_user_id = $1',
      [supabaseUser.id]
    );

    if (pessoaExistente.length > 0) {
      return res.status(409).json({ erro: 'Usuário já vinculado a uma pessoa no sistema' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const nome = req.body.nome || convite.email.split('@')[0];

      const { rows: pessoaRows } = await client.query(
        `INSERT INTO pessoas (nome, email, supabase_user_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [nome, convite.email, supabaseUser.id]
      );
      const pessoa = pessoaRows[0];

      if (convite.casa_id) {
        await client.query(
          `INSERT INTO casa_pessoas (casa_id, pessoa_id, papel)
           VALUES ($1, $2, $3)`,
          [convite.casa_id, pessoa.id, convite.papel || 'membro']
        );
      }

      await client.query(
        `UPDATE convites SET status = 'aceito' WHERE id = $1`,
        [convite.id]
      );

      await client.query('COMMIT');

      res.json(pessoa);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM convites WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Convite não encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { email, convidado_por_id, casa_id, papel, expires_at } = req.body;

    if (!email || !convidado_por_id) {
      return res.status(400).json({ erro: 'email e convidado_por_id são obrigatórios' });
    }

    if (papel !== undefined && papel !== 'admin' && papel !== 'membro') {
      return res.status(400).json({ erro: "papel deve ser 'admin' ou 'membro'" });
    }

    const token = crypto.randomBytes(32).toString('hex');

    const { rows } = await pool.query(
      `INSERT INTO convites (email, convidado_por_id, casa_id, papel, token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [email, convidado_por_id, orNull(casa_id), orNull(papel), token, orNull(expires_at)]
    );

    const convite = rows[0];

    const redirectTo = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/convite?token=${token}`
      : undefined;

    try {
      await inviteSupabaseUser(email, redirectTo);
    } catch (inviteErr) {
      await pool.query('DELETE FROM convites WHERE id = $1', [convite.id]);
      throw inviteErr;
    }

    res.status(201).json(convite);
  } catch (err) {
    next(err);
  }
});

// Aceite simples por ID — para uso administrativo
router.patch('/:id/aceitar', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE convites SET status = 'aceito'
       WHERE id = $1 AND status = 'pendente'
       RETURNING *`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Convite não encontrado ou não está pendente' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/expirar', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE convites SET status = 'expirado'
       WHERE id = $1 AND status = 'pendente'
       RETURNING *`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Convite não encontrado ou não está pendente' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
