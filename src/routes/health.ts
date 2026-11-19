import { Router } from 'express';
import pool from '../db';

// Endpoints públicos de saúde, sem autenticação e sem dados.
//
// - GET /health    → a API está no ar (não toca no banco).
// - GET /health/db → a API alcança o banco (`select 1`). Usado pelo
//   agendamento que mantém o Supabase gratuito do TCC acordado e pela
//   monitoria. Ver se-controle-workspace: docs/planos/
//   estrategia-ambientes-e-roadmap-baseline-tcc.md (10.2 e 10.9).
const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/db', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ status: 'ok', banco: 'ok' });
  } catch (err) {
    // Sem detalhes do erro na resposta: o endpoint é público.
    console.error('[health/db] falha ao consultar o banco', err);
    res.status(503).json({ status: 'erro', banco: 'indisponivel' });
  }
});

export default router;
