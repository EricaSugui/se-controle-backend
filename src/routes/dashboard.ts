import { Router } from 'express';
import { calcularResumo } from '../services/resumoFinanceiro';
import { autenticar } from '../middleware/auth';

const router = Router();

router.get('/', autenticar, async (req, res, next) => {
  try {
    const { competencia } = req.query;
    if (!competencia) return res.status(400).json({ erro: 'competencia é obrigatória' });
    const pessoaId = (req as any).usuario.id;
    res.json(await calcularResumo(competencia as string, pessoaId));
  } catch (err) {
    next(err);
  }
});

export default router;
