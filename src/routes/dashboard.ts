import { Router } from 'express';
import { calcularResumo } from '../services/resumoFinanceiro';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { competencia } = req.query;
    if (!competencia) return res.status(400).json({ erro: 'competencia é obrigatória' });
    res.json(await calcularResumo(competencia as string));
  } catch (err) {
    next(err);
  }
});

export default router;
