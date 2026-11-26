import { Router } from 'express';
import { getSupabaseUser } from '../config/supabase';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { garantirCasaPessoal } from '../services/casaPessoal';

const router = Router();

router.get('/me', autenticar, async (req, res, next) => {
  try {
    // Rede de segurança: quem tem login e ainda não tem espaço pessoal ganha
    // o seu aqui (o app chama /auth/me ao abrir). Idempotente.
    await garantirCasaPessoal(pool, (req as any).usuario.id);
    res.json((req as any).usuario);
  } catch (err) {
    next(err);
  }
});

router.post('/vincular', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const user = await getSupabaseUser(authHeader.slice(7));
    if (!user || !user.id) return res.status(401).json({ erro: 'Token inválido ou expirado' });

    const { pessoa_id } = req.body;
    if (!pessoa_id) return res.status(400).json({ erro: 'pessoa_id é obrigatório' });

    const { rows: existente } = await pool.query(
      'SELECT id FROM pessoas WHERE supabase_user_id = $1',
      [user.id]
    );

    if (existente.length > 0) return res.status(409).json({ erro: 'Este usuário já está vinculado a uma pessoa' });

    const { rows } = await pool.query(
      `UPDATE pessoas SET supabase_user_id = $1 WHERE id = $2 AND supabase_user_id IS NULL RETURNING *`,
      [user.id, pessoa_id]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Pessoa não encontrada ou já vinculada a outro usuário' });

    // a pessoa passou a ter login: ganha o espaço pessoal
    await garantirCasaPessoal(pool, rows[0].id);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
