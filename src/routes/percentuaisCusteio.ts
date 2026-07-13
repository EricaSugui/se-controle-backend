import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { ehCompetenciaValida } from '../utils/competencia';

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

    const { competencia, pessoa_id } = req.query;
    const params: unknown[] = [casaId];
    let query = 'SELECT * FROM percentuais_custeio WHERE casa_id = $1';

    if (competencia !== undefined) {
      params.push(competencia);
      query += ` AND competencia = $${params.length}`;
    }

    if (pessoa_id !== undefined) {
      params.push(pessoa_id);
      query += ` AND pessoa_id = $${params.length}`;
    }

    query += ' ORDER BY competencia DESC';
    const { rows } = await pool.query(query, params);
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
      return res.status(403).json({ erro: 'Apenas admins da casa podem definir percentuais de custeio' });
    }

    const { pessoa_id, competencia, percentual } = req.body;

    if (!pessoa_id || !competencia || percentual === undefined) {
      return res.status(400).json({ erro: 'pessoa_id, competencia e percentual são obrigatórios' });
    }

    if (!ehCompetenciaValida(competencia)) {
      return res.status(400).json({ erro: `competencia inválida: ${competencia}` });
    }

    const { rows } = await pool.query(
      `INSERT INTO percentuais_custeio (casa_id, pessoa_id, competencia, percentual)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (casa_id, pessoa_id, competencia)
       DO UPDATE SET percentual = EXCLUDED.percentual
       RETURNING *`,
      [casaId, pessoa_id, competencia, percentual]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
