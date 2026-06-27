const express = require('express');
const { getSupabaseUser } = require('../config/supabase');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

router.get('/me', autenticar, (req, res) => {
  res.json(req.usuario);
});

router.post('/vincular', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const user = await getSupabaseUser(authHeader.slice(7));

    if (!user || !user.id) {
      return res.status(401).json({ erro: 'Token inválido ou expirado' });
    }

    const { pessoa_id } = req.body;

    if (!pessoa_id) {
      return res.status(400).json({ erro: 'pessoa_id é obrigatório' });
    }

    const { rows: existente } = await pool.query(
      'SELECT id FROM pessoas WHERE supabase_user_id = $1',
      [user.id]
    );

    if (existente.length > 0) {
      return res.status(409).json({ erro: 'Este usuário já está vinculado a uma pessoa' });
    }

    const { rows } = await pool.query(
      `UPDATE pessoas SET supabase_user_id = $1
       WHERE id = $2 AND supabase_user_id IS NULL
       RETURNING *`,
      [user.id, pessoa_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Pessoa não encontrada ou já vinculada a outro usuário' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
