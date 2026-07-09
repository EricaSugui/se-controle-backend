import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router({ mergeParams: true });

async function compraVisivel(pessoaId: number, compraId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM compras WHERE id = $1 AND casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $2)`,
    [compraId, pessoaId]
  );
  return rows.length > 0;
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const compraId = (req.params as any).compraId;

    if (!(await compraVisivel(pessoaId, compraId))) {
      return res.status(404).json({ erro: 'Compra não encontrada' });
    }

    const { rows } = await pool.query(
      `SELECT cp.id, cp.pessoa_id, cp.percentual, cp.created_at, p.nome
       FROM compra_pagadores cp
       JOIN pessoas p ON p.id = cp.pessoa_id
       WHERE cp.compra_id = $1
       ORDER BY p.nome`,
      [compraId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const compraId = (req.params as any).compraId;
    const { pessoa_id, percentual } = req.body;

    if (!pessoa_id) return res.status(400).json({ erro: 'pessoa_id é obrigatório' });
    if (!(await compraVisivel(pessoaId, compraId))) {
      return res.status(404).json({ erro: 'Compra não encontrada' });
    }

    const { rows } = await pool.query(
      `INSERT INTO compra_pagadores (compra_id, pessoa_id, percentual) VALUES ($1, $2, $3) RETURNING *`,
      [compraId, pessoa_id, percentual === undefined ? null : percentual]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as any).code === '23505') return res.status(409).json({ erro: 'Pessoa já registrada como pagadora desta compra' });
    if ((err as any).code === '23503') return res.status(404).json({ erro: 'Compra ou pessoa não encontrada' });
    next(err);
  }
});

router.patch('/:pessoaId', autenticar, async (req, res, next) => {
  try {
    const pessoaIdAutenticado = (req as any).usuario.id;
    const compraId = (req.params as any).compraId;
    const { percentual } = req.body;

    if (!(await compraVisivel(pessoaIdAutenticado, compraId))) {
      return res.status(404).json({ erro: 'Compra não encontrada' });
    }

    const { rows } = await pool.query(
      `UPDATE compra_pagadores SET percentual = $1 WHERE compra_id = $2 AND pessoa_id = $3 RETURNING *`,
      [percentual === undefined ? null : percentual, compraId, req.params.pessoaId]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Pagador não encontrado nesta compra' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:pessoaId', autenticar, async (req, res, next) => {
  try {
    const pessoaIdAutenticado = (req as any).usuario.id;
    const compraId = (req.params as any).compraId;

    if (!(await compraVisivel(pessoaIdAutenticado, compraId))) {
      return res.status(404).json({ erro: 'Compra não encontrada' });
    }

    const { rows } = await pool.query(
      `DELETE FROM compra_pagadores WHERE compra_id = $1 AND pessoa_id = $2 RETURNING id`,
      [compraId, req.params.pessoaId]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Pagador não encontrado nesta compra' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
