import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { confirmarAcerto, listarAcertos, obterAcerto } from '../services/relatorioAcerto';

const router = Router({ mergeParams: true });

async function participaCasa(pessoaId: number, casaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

async function podeVisualizarAcertos(pessoaId: number, casaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
     WHERE EXISTS (
       SELECT 1 FROM casa_pessoas
       WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'
     )
     OR EXISTS (
       SELECT 1 FROM acerto_participantes ap
       JOIN acertos a ON a.id = ap.acerto_id
       WHERE a.casa_id = $1 AND ap.pessoa_id = $2
     )
     OR EXISTS (
       SELECT 1
       FROM compra_pagadores cp
       JOIN compras c ON c.id = cp.compra_id
       WHERE c.casa_id = $1 AND cp.pessoa_id = $2
     )
     OR EXISTS (
       SELECT 1 FROM percentuais_custeio
       WHERE casa_id = $1 AND pessoa_id = $2
     )`,
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

function responderErro(err: unknown, res: any, next: any): void {
  const status = (err as { status?: number }).status;
  if (status) {
    res.status(status).json({ erro: (err as Error).message });
    return;
  }
  next(err);
}

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = Number(req.params.casaId);
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey?.trim()) {
      return res.status(400).json({ erro: 'Idempotency-Key é obrigatório' });
    }
    if (!(await participaCasa(pessoaId, String(casaId)))) {
      return res.status(403).json({ erro: 'Você não participa desta casa' });
    }
    const relatorio = await confirmarAcerto(casaId, pessoaId, idempotencyKey.trim());
    res.status(201).json(relatorio);
  } catch (err) {
    responderErro(err, res, next);
  }
});

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    if (!(await podeVisualizarAcertos(pessoaId, req.params.casaId))) {
      return res.status(403).json({ erro: 'Você não tem permissão para visualizar os acertos desta casa' });
    }
    res.json(await listarAcertos(Number(req.params.casaId)));
  } catch (err) {
    responderErro(err, res, next);
  }
});

router.get('/:acertoId', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    if (!(await podeVisualizarAcertos(pessoaId, req.params.casaId))) {
      return res.status(403).json({ erro: 'Você não tem permissão para visualizar este acerto' });
    }
    res.json(await obterAcerto(Number(req.params.casaId), Number(req.params.acertoId)));
  } catch (err) {
    responderErro(err, res, next);
  }
});

export default router;
