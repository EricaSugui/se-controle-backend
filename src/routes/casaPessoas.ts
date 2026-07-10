import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router({ mergeParams: true });

async function participaCasa(pessoaId: number, casaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

async function adminCasa(pessoaId: number, casaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'`,
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = (req.params as any).casaId;
    if (!(await participaCasa(pessoaId, casaId))) {
      return res.status(403).json({ erro: 'Você não participa desta casa' });
    }

    const { rows } = await pool.query(
      `SELECT cp.id, cp.pessoa_id, cp.papel, cp.created_at, p.nome, p.email, p.ativo
       FROM casa_pessoas cp
       JOIN pessoas p ON p.id = cp.pessoa_id
       WHERE cp.casa_id = $1
       ORDER BY p.nome`,
      [casaId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = (req.params as any).casaId;
    if (!(await adminCasa(pessoaId, casaId))) {
      return res.status(403).json({ erro: 'Apenas admins da casa podem adicionar pessoas' });
    }

    const { pessoa_id, papel } = req.body;
    if (!pessoa_id) return res.status(400).json({ erro: 'pessoa_id é obrigatório' });

    const papelValido = papel === 'admin' ? 'admin' : 'membro';

    const { rows } = await pool.query(
      `INSERT INTO casa_pessoas (casa_id, pessoa_id, papel) VALUES ($1, $2, $3) RETURNING *`,
      [casaId, pessoa_id, papelValido]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as any).code === '23505') return res.status(409).json({ erro: 'Pessoa já associada a esta casa' });
    next(err);
  }
});

router.patch('/:pessoaId/papel', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = (req.params as any).casaId;
    if (!(await adminCasa(pessoaId, casaId))) {
      return res.status(403).json({ erro: 'Apenas admins da casa podem alterar papéis' });
    }

    const { papel } = req.body;
    if (papel !== 'admin' && papel !== 'membro') return res.status(400).json({ erro: "papel deve ser 'admin' ou 'membro'" });

    const { rows } = await pool.query(
      `UPDATE casa_pessoas SET papel = $1 WHERE casa_id = $2 AND pessoa_id = $3 RETURNING *`,
      [papel, casaId, req.params.pessoaId]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Associação não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:pessoaId', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = (req.params as any).casaId;
    if (!(await adminCasa(pessoaId, casaId))) {
      return res.status(403).json({ erro: 'Apenas admins da casa podem remover pessoas' });
    }

    const { rows } = await pool.query(
      'DELETE FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 RETURNING id',
      [casaId, req.params.pessoaId]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Associação não encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
