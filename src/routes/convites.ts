import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { getSupabaseUser, inviteSupabaseUser, findSupabaseUserByEmail } from '../config/supabase';
import { autenticar } from '../middleware/auth';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

const SELECT_SEM_TOKEN = 'id, email, convidado_por_id, casa_id, papel, status, expires_at, created_at, tipo';

async function nomePessoaDisponivel(client: any, nomePreferido: string, usuarioId: string): Promise<string> {
  const nome = nomePreferido.trim() || usuarioId;
  const { rows } = await client.query('SELECT 1 FROM pessoas WHERE nome = $1 LIMIT 1', [nome]);
  return rows.length > 0 ? nome + ' (' + usuarioId.slice(0, 8) + ')' : nome;
}

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

router.get('/recebidos', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(
      `SELECT c.id, c.email, c.casa_id, c.papel, c.status, c.expires_at, c.created_at,
              c.tipo, casa.nome AS casa_nome, p.nome AS convidado_por_nome
       FROM convites c
       LEFT JOIN casas casa ON casa.id = c.casa_id
       JOIN pessoas p ON p.id = c.convidado_por_id
       JOIN pessoas destinatario ON destinatario.id = $1
       WHERE c.status = 'pendente'
         AND (c.expires_at IS NULL OR c.expires_at >= now())
         AND (
           c.destinatario_pessoa_id = $1
           OR (
             c.destinatario_pessoa_id IS NULL
             AND LOWER(destinatario.email) = LOWER(c.email)
           )
         )
         AND (c.tipo = 'interno' OR c.destinatario_pessoa_id IS NULL)
       ORDER BY c.created_at DESC`,
      [pessoaId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
router.patch('/recebidos/:id/aceitar', autenticar, async (req, res, next) => {
  const pessoaId = (req as any).usuario.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT c.id, c.casa_id, c.papel
       FROM convites c
       JOIN pessoas destinatario ON destinatario.id = $2
       WHERE c.id = $1
         AND c.status = 'pendente'
         AND (c.expires_at IS NULL OR c.expires_at >= now())
         AND (
           c.destinatario_pessoa_id = $2
           OR (
             c.destinatario_pessoa_id IS NULL
             AND LOWER(destinatario.email) = LOWER(c.email)
           )
         )
         AND (c.tipo = 'interno' OR c.destinatario_pessoa_id IS NULL)
       FOR UPDATE OF c`,
      [req.params.id, pessoaId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Convite não encontrado ou expirado' });
    }

    const convite = rows[0];
    if (convite.casa_id == null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Este convite não está vinculado a uma casa' });
    }

    await client.query(
      `INSERT INTO casa_pessoas (casa_id, pessoa_id, papel)
       VALUES ($1, $2, $3)
       ON CONFLICT (casa_id, pessoa_id) DO NOTHING`,
      [convite.casa_id, pessoaId, convite.papel || 'membro']
    );
    const { rows: aceito } = await client.query(
      `UPDATE convites SET status = 'aceito'
       WHERE id = $1 RETURNING ${SELECT_SEM_TOKEN}`,
      [convite.id]
    );
    await client.query('COMMIT');
    res.json(aceito[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});
router.get('/token/:token', async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM convites WHERE token = $1 AND tipo = 'email'", [req.params.token]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Convite não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/token/:token/aceitar', async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  const client = await pool.connect();
  try {
    const supabaseUser = await getSupabaseUser(authHeader.slice(7));
    if (!supabaseUser?.id || !supabaseUser.email) {
      return res.status(401).json({ erro: 'Token inválido ou expirado' });
    }

    await client.query('BEGIN');
    const { rows: conviteRows } = await client.query(
      `SELECT * FROM convites
       WHERE token = $1 AND tipo = 'email'
       FOR UPDATE`,
      [req.params.token]
    );
    if (conviteRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Convite não encontrado' });
    }

    const convite = conviteRows[0];
    if (convite.status !== 'pendente') {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Convite já utilizado ou expirado' });
    }
    if (convite.expires_at && new Date(convite.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Convite expirado' });
    }
    if (supabaseUser.email.trim().toLowerCase() !== String(convite.email).trim().toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ erro: 'Email do usuário não corresponde ao convite' });
    }

    const { rows: pessoaPorUsuario } = await client.query(
      'SELECT * FROM pessoas WHERE supabase_user_id = $1 FOR UPDATE',
      [supabaseUser.id]
    );
    let pessoa = pessoaPorUsuario[0] ?? null;

    if (convite.destinatario_pessoa_id && pessoa && pessoa.id !== convite.destinatario_pessoa_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        erro: 'Este usuário já está vinculado a outra pessoa. Revise o vínculo antes de aceitar o convite.',
      });
    }

    if (!pessoa) {
      let pessoaAlvo: any = null;
      if (convite.destinatario_pessoa_id) {
        const { rows } = await client.query(
          'SELECT * FROM pessoas WHERE id = $1 FOR UPDATE',
          [convite.destinatario_pessoa_id]
        );
        pessoaAlvo = rows[0] ?? null;
      } else {
        const { rows } = await client.query(
          'SELECT * FROM pessoas WHERE LOWER(email) = LOWER($1) ORDER BY id FOR UPDATE',
          [convite.email]
        );
        if (rows.length > 1) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            erro: 'Encontramos mais de uma pessoa com este e-mail. Revise os cadastros antes de aceitar o convite.',
          });
        }
        pessoaAlvo = rows[0] ?? null;
      }

      if (pessoaAlvo?.supabase_user_id && pessoaAlvo.supabase_user_id !== supabaseUser.id) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          erro: 'Este e-mail já está vinculado a outra conta. Revise o cadastro antes de aceitar o convite.',
        });
      }

      if (pessoaAlvo) {
        const { rows } = await client.query(
          `UPDATE pessoas
           SET supabase_user_id = $1, email = $2
           WHERE id = $3
           RETURNING *`,
          [supabaseUser.id, supabaseUser.email.trim().toLowerCase(), pessoaAlvo.id]
        );
        pessoa = rows[0];
      } else {
        const nomeInformado = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
        const nome = await nomePessoaDisponivel(client, nomeInformado || supabaseUser.email, supabaseUser.id);
        const { rows } = await client.query(
          `INSERT INTO pessoas (nome, email, supabase_user_id)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [nome, supabaseUser.email.trim().toLowerCase(), supabaseUser.id]
        );
        pessoa = rows[0];
      }
    }

    if (convite.casa_id) {
      await client.query(
        `INSERT INTO casa_pessoas (casa_id, pessoa_id, papel)
         VALUES ($1, $2, $3)
         ON CONFLICT (casa_id, pessoa_id) DO NOTHING`,
        [convite.casa_id, pessoa.id, convite.papel || 'membro']
      );
    }

    await client.query(
      `INSERT INTO onboarding_pessoas (pessoa_id, perfil)
       VALUES ($1, 'convidado')
       ON CONFLICT (pessoa_id) DO UPDATE SET perfil = 'convidado', updated_at = now()`,
      [pessoa.id]
    );

    await client.query(
      "UPDATE convites SET status = 'aceito' WHERE id = $1",
      [convite.id]
    );
    await client.query('COMMIT');
    res.json(pessoa);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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
    const { email: emailInformado, casa_id, papel, expires_at } = req.body;

    if (!emailInformado || typeof emailInformado !== 'string') {
      return res.status(400).json({ erro: 'email é obrigatório' });
    }
    const email = emailInformado.trim().toLowerCase();
    if (papel !== undefined && papel !== null && papel !== 'admin' && papel !== 'membro') {
      return res.status(400).json({ erro: "papel deve ser 'admin' ou 'membro'" });
    }

    if (casa_id !== undefined && casa_id !== null && !(await adminCasa(pessoaId, casa_id))) {
      return res.status(403).json({ erro: 'Apenas admins da casa podem convidar para ela' });
    }

    const { rows: pessoaRows } = await pool.query(
      `SELECT id, email, supabase_user_id
       FROM pessoas
       WHERE LOWER(email) = LOWER($1)
       ORDER BY id`,
      [email]
    );
    if (pessoaRows.length > 1) {
      return res.status(409).json({
        erro: 'Encontramos mais de uma pessoa com este e-mail. Revise os cadastros antes de convidar.',
      });
    }

    let pessoaExistente = pessoaRows[0] ?? null;
    if (pessoaExistente && Number(pessoaExistente.id) === Number(pessoaId)) {
      return res.status(400).json({ erro: 'Você não pode convidar a si mesmo' });
    }

    // A existência da conta é verificada no Auth. O vínculo local serve para
    // localizar a pessoa do domínio, não para presumir que o e-mail ainda é atual.
    const usuarioAuth = await findSupabaseUserByEmail(email);

    if (pessoaExistente?.supabase_user_id && pessoaExistente.supabase_user_id !== usuarioAuth?.id) {
      return res.status(409).json({
        erro: 'O cadastro local está vinculado a uma conta diferente ou inexistente no Supabase para este e-mail. Revise o vínculo antes de convidar.',
      });
    }

    if (usuarioAuth && casa_id == null) {
      return res.status(400).json({
        erro: 'Para convidar uma conta existente, selecione uma casa e envie o convite pela área de membros da casa',
      });
    }

    if (usuarioAuth) {
      const { rows: pessoaPorUsuarioRows } = await pool.query(
        'SELECT id, email, supabase_user_id FROM pessoas WHERE supabase_user_id = $1',
        [usuarioAuth.id]
      );
      const pessoaPorUsuario = pessoaPorUsuarioRows[0] ?? null;

      if (pessoaExistente && pessoaPorUsuario && Number(pessoaExistente.id) !== Number(pessoaPorUsuario.id)) {
        return res.status(409).json({
          erro: 'O e-mail informado e a conta Supabase estão vinculados a pessoas diferentes. Revise o cadastro antes de convidar.',
        });
      }
      pessoaExistente = pessoaExistente ?? pessoaPorUsuario;

      if (pessoaExistente?.supabase_user_id && pessoaExistente.supabase_user_id !== usuarioAuth.id) {
        return res.status(409).json({
          erro: 'Este e-mail já está vinculado a outra conta. Revise o cadastro antes de convidar.',
        });
      }
    }

    if (casa_id != null && pessoaExistente) {
      const { rows: membroRows } = await pool.query(
        'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
        [casa_id, pessoaExistente.id]
      );
      if (membroRows.length > 0) {
        return res.status(409).json({ erro: 'Esta pessoa já participa da casa' });
      }
    }

    if (usuarioAuth && pessoaExistente) {
      const { rows: pendenteRows } = await pool.query(
        `SELECT id FROM convites
         WHERE casa_id = $1
           AND (destinatario_pessoa_id = $2 OR (destinatario_pessoa_id IS NULL AND LOWER(email) = LOWER($3)))
           AND status = 'pendente'
           AND (expires_at IS NULL OR expires_at >= now())`,
        [casa_id, pessoaExistente.id, email]
      );
      if (pendenteRows.length > 0) {
        return res.status(409).json({ erro: 'Já existe um convite pendente para esta pessoa nesta casa' });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tipo = usuarioAuth ? 'interno' : 'email';
    const client = await pool.connect();
    let convite: any;
    try {
      await client.query('BEGIN');

      let destinatarioPessoaId: number | null = pessoaExistente?.id ?? null;
      if (usuarioAuth) {
        if (destinatarioPessoaId) {
          const { rows } = await client.query(
            `UPDATE pessoas
             SET supabase_user_id = $1
             WHERE id = $2 AND (supabase_user_id IS NULL OR supabase_user_id = $1)
             RETURNING id`,
            [usuarioAuth.id, destinatarioPessoaId]
          );
          if (rows.length === 0) {
            throw new Error('Não foi possível confirmar o vínculo entre a pessoa e a conta Supabase');
          }
        } else {
          const { rows } = await client.query(
            `INSERT INTO pessoas (nome, email, supabase_user_id)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [await nomePessoaDisponivel(client, usuarioAuth.nome || email, usuarioAuth.id), email, usuarioAuth.id]
          );
          destinatarioPessoaId = rows[0].id;
        }
      }

      const { rows } = await client.query(
        `INSERT INTO convites
           (email, convidado_por_id, casa_id, papel, token, expires_at, tipo, destinatario_pessoa_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [email, pessoaId, orNull(casa_id), orNull(papel), token, orNull(expires_at), tipo, destinatarioPessoaId]
      );
      convite = rows[0];
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (tipo === 'interno') {
      const { token: _token, ...conviteSemToken } = convite;
      return res.status(201).json({ ...conviteSemToken, interno: true });
    }

    const redirectTo = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/convidado?token=${token}`
      : undefined;
    const metadata: Record<string, string> = {};
    if (casa_id) {
      const { rows: casaRows } = await pool.query('SELECT nome FROM casas WHERE id = $1', [casa_id]);
      if (casaRows.length > 0) metadata.casa_nome = casaRows[0].nome;
    }
    const { rows: convidadoPorRows } = await pool.query(
      'SELECT nome FROM pessoas WHERE id = $1',
      [pessoaId]
    );
    if (convidadoPorRows.length > 0) metadata.convidado_por_nome = convidadoPorRows[0].nome;
    if (papel) metadata.papel = papel === 'admin' ? 'administrador(a)' : 'membro';

    try {
      await inviteSupabaseUser(email, redirectTo, metadata);
    } catch (inviteErr) {
      await pool.query('DELETE FROM convites WHERE id = $1', [convite.id]);
      throw inviteErr;
    }

    const { token: _token, ...conviteSemToken } = convite;
    return res.status(201).json(conviteSemToken);
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
