import { Router } from 'express';
import pool from '../db';

const router = Router({ mergeParams: true });

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT tp.id, tp.pessoa_id, tp.percentual, tp.created_at, p.nome
       FROM transacao_pagadores tp
       JOIN pessoas p ON p.id = tp.pessoa_id
       WHERE tp.transacao_id = $1
       ORDER BY p.nome`,
      [(req.params as any).transacaoId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { pessoa_id, percentual } = req.body;
    if (!pessoa_id) return res.status(400).json({ erro: 'pessoa_id é obrigatório' });

    const { rows } = await pool.query(
      `INSERT INTO transacao_pagadores (transacao_id, pessoa_id, percentual) VALUES ($1, $2, $3) RETURNING *`,
      [(req.params as any).transacaoId, pessoa_id, percentual === undefined ? null : percentual]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as any).code === '23505') return res.status(409).json({ erro: 'Pessoa já registrada como pagadora desta transação' });
    if ((err as any).code === '23503') return res.status(404).json({ erro: 'Transação ou pessoa não encontrada' });
    next(err);
  }
});

router.patch('/:pessoaId', async (req, res, next) => {
  try {
    const { percentual } = req.body;

    const { rows } = await pool.query(
      `UPDATE transacao_pagadores SET percentual = $1 WHERE transacao_id = $2 AND pessoa_id = $3 RETURNING *`,
      [percentual === undefined ? null : percentual, (req.params as any).transacaoId, req.params.pessoaId]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Pagador não encontrado nesta transação' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:pessoaId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM transacao_pagadores WHERE transacao_id = $1 AND pessoa_id = $2 RETURNING id`,
      [(req.params as any).transacaoId, req.params.pessoaId]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Pagador não encontrado nesta transação' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
