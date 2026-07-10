import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { getSupabaseUser, inviteSupabaseUser } from '../config/supabase';
import { autenticar } from '../middleware/auth';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

const SELECT_SEM_TOKEN = 'id, email, convidado_por_id, casa_id, papel, status, expires_at, created_at';

async function adminCasa(pessoaId: number, casaId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'`,
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { status, email } = req.query;
    const params: unknown[] = [pessoaId];
    let query = `SELECT ${SELECT_SEM_TOKEN} FROM convites
      WHERE (
        (casa_id IS NOT NULL AND casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1 AND papel = 'admin'))
        OR (casa_id IS NULL AND convidado_por_id = $1)
      )`;

    if (status !== undefined) { params.push(status); query += ` AND status = $${params.length}`; }
    if (email !== undefined) { params.push(email); query += ` AND email = $${params.length}`; }
    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/token/:token', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM convites WHERE token = $1', [req.params.token]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Convite não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/token/:token/aceitar', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ erro: 'Token não fornecido' });

    const supabaseUser = await getSupabaseUser(authHeader.slice(7));
    if (!supabaseUser || !supabaseUser.id) return res.status(401).json({ erro: 'Token inválido ou expirado' });

    const { rows: conviteRows } = await pool.query('SELECT * FROM convites WHERE token = $1', [req.params.token]);
    if (conviteRows.length === 0) return res.status(404).json({ erro: 'Convite não encontrado' });

    const convite = conviteRows[0];
    if (convite.status !== 'pendente') return res.status(409).json({ erro: 'Convite já utilizado ou expirado' });
    if (convite.expires_at && new Date(convite.expires_at) < new Date()) return res.status(409).json({ erro: 'Convite expirado' });
    if (supabaseUser.email !== convite.email) return res.status(403).json({ erro: 'Email do usuário não corresponde ao convite' });

    const { rows: pessoaExistente } = await pool.query('SELECT id FROM pessoas WHERE supabase_user_id = $1', [supabaseUser.id]);
    if (pessoaExistente.length > 0) return res.status(409).json({ erro: 'Usuário já vinculado a uma pessoa no sistema' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const nome = req.body.nome || convite.email.split('@')[0];
      const { rows: pessoaRows } = await client.query(
        `INSERT INTO pessoas (nome, email, supabase_user_id) VALUES ($1, $2, $3) RETURNING *`,
        [nome, convite.email, supabaseUser.id]
      );
      const pessoa = pessoaRows[0];

      if (convite.casa_id) {
        await client.query(
          `INSERT INTO casa_pessoas (casa_id, pessoa_id, papel) VALUES ($1, $2, $3)`,
          [convite.casa_id, pessoa.id, convite.papel || 'membro']
        );
      }

      await client.query(`UPDATE convites SET status = 'aceito' WHERE id = $1`, [convite.id]);
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

router.get('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(`SELECT ${SELECT_SEM_TOKEN} FROM convites WHERE id = $1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Convite não encontrado' });

    const convite = rows[0];
    const autorizado = convite.casa_id
      ? await adminCasa(pessoaId, convite.casa_id)
      : convite.convidado_por_id === pessoaId;
    if (!autorizado) return res.status(404).json({ erro: 'Convite não encontrado' });

    res.json(convite);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { email, casa_id, papel, expires_at } = req.body;

    if (!email) return res.status(400).json({ erro: 'email é obrigatório' });
    if (papel !== undefined && papel !== 'admin' && papel !== 'membro') return res.status(400).json({ erro: "papel deve ser 'admin' ou 'membro'" });

    if (casa_id !== undefined && casa_id !== null && !(await adminCasa(pessoaId, casa_id))) {
      return res.status(403).json({ erro: 'Apenas admins da casa podem convidar para ela' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    // convidado_por_id é sempre o usuário autenticado, nunca o valor enviado pelo cliente
    const { rows } = await pool.query(
      `INSERT INTO convites (email, convidado_por_id, casa_id, papel, token, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [email, pessoaId, orNull(casa_id), orNull(papel), token, orNull(expires_at)]
    );

    const convite = rows[0];
    const redirectTo = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/convidado?token=${token}` : undefined;

    const metadata: Record<string, string> = {};
    if (casa_id) {
      const { rows: casaRows } = await pool.query('SELECT nome FROM casas WHERE id = $1', [casa_id]);
      if (casaRows.length > 0) metadata.casa_nome = casaRows[0].nome;
    }
    const { rows: convidadoPorRows } = await pool.query('SELECT nome FROM pessoas WHERE id = $1', [pessoaId]);
    if (convidadoPorRows.length > 0) metadata.convidado_por_nome = convidadoPorRows[0].nome;
    if (papel) metadata.papel = papel === 'admin' ? 'administrador(a)' : 'membro';

    try {
      await inviteSupabaseUser(email, redirectTo, metadata);
    } catch (inviteErr) {
      await pool.query('DELETE FROM convites WHERE id = $1', [convite.id]);
      throw inviteErr;
    }

    const { token: _token, ...conviteSemToken } = convite;
    res.status(201).json(conviteSemToken);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/aceitar', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows: conviteRows } = await pool.query('SELECT casa_id, convidado_por_id FROM convites WHERE id = $1', [req.params.id]);
    if (conviteRows.length === 0) return res.status(404).json({ erro: 'Convite não encontrado' });

    const { casa_id, convidado_por_id } = conviteRows[0];
    const autorizado = casa_id ? await adminCasa(pessoaId, casa_id) : convidado_por_id === pessoaId;
    if (!autorizado) return res.status(403).json({ erro: 'Você não pode gerenciar este convite' });

    const { rows } = await pool.query(
      `UPDATE convites SET status = 'aceito' WHERE id = $1 AND status = 'pendente' RETURNING ${SELECT_SEM_TOKEN}`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Convite não encontrado ou não está pendente' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/expirar', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows: conviteRows } = await pool.query('SELECT casa_id, convidado_por_id FROM convites WHERE id = $1', [req.params.id]);
    if (conviteRows.length === 0) return res.status(404).json({ erro: 'Convite não encontrado' });

    const { casa_id, convidado_por_id } = conviteRows[0];
    const autorizado = casa_id ? await adminCasa(pessoaId, casa_id) : convidado_por_id === pessoaId;
    if (!autorizado) return res.status(403).json({ erro: 'Você não pode gerenciar este convite' });

    const { rows } = await pool.query(
      `UPDATE convites SET status = 'expirado' WHERE id = $1 AND status = 'pendente' RETURNING ${SELECT_SEM_TOKEN}`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Convite não encontrado ou não está pendente' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
