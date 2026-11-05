import { Router } from 'express';
import { calcularResumo } from '../services/resumoFinanceiro';
import { autenticar } from '../middleware/auth';
import pool from '../db';

const router = Router();

router.get('/', autenticar, async (req, res, next) => {
  try {
    const { competencia, eixo } = req.query;
    if (!competencia) return res.status(400).json({ erro: 'competencia é obrigatória' });
    const pessoaId = (req as any).usuario.id;
    const eixoValido = eixo === 'competencia' ? 'competencia' : 'caixa';
    const casaId = req.query.casa_id === undefined ? undefined : Number(req.query.casa_id);
    if (casaId !== undefined && (!Number.isInteger(casaId) || casaId <= 0)) {
      return res.status(400).json({ erro: 'casa_id inválido' });
    }
    if (casaId !== undefined) {
      const { rows } = await pool.query(
        `SELECT 1 FROM casa_pessoas cp
         JOIN casas c ON c.id = cp.casa_id
         WHERE cp.casa_id = $1 AND cp.pessoa_id = $2 AND c.ativo = true`,
        [casaId, pessoaId]
      );
      if (rows.length === 0) return res.status(403).json({ erro: 'Você não participa desta casa' });
    }
    res.json(await calcularResumo(competencia as string, pessoaId, eixoValido, casaId));
  } catch (err) {
    next(err);
  }
});

export default router;
