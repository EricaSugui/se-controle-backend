import { Request, Response, NextFunction } from 'express';
import { getSupabaseUser } from '../config/supabase';
import pool from '../db';

export async function autenticar(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ erro: 'Token não fornecido' });
    return;
  }

  const token = authHeader.slice(7);
  const user = await getSupabaseUser(token);

  if (!user || !user.id) {
    res.status(401).json({ erro: 'Token inválido ou expirado' });
    return;
  }

  const { rows } = await pool.query('SELECT * FROM pessoas WHERE supabase_user_id = $1', [user.id]);

  if (rows.length === 0) {
    res.status(403).json({ erro: 'Usuário não vinculado a nenhuma pessoa no sistema' });
    return;
  }

  (req as any).usuario = rows[0];
  next();
}
