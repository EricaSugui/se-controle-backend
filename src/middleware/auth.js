const { getSupabaseUser } = require('../config/supabase');
const pool = require('../db');

async function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  const token = authHeader.slice(7);
  const user = await getSupabaseUser(token);

  if (!user || !user.id) {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM pessoas WHERE supabase_user_id = $1',
    [user.id]
  );

  if (rows.length === 0) {
    return res.status(403).json({ erro: 'Usuário não vinculado a nenhuma pessoa no sistema' });
  }

  req.usuario = rows[0];
  next();
}

module.exports = { autenticar };
