import { Router } from 'express';
import { calcularResumo } from '../services/resumoFinanceiro';
import { adicionarMesesCompetencia, mesesEntre } from '../utils/competencia';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { de, ate } = req.query;

    if (!de || !ate) return res.status(400).json({ erro: 'de e ate são obrigatórios' });

    const totalMeses = mesesEntre(de as string, ate as string);

    if (totalMeses < 0) return res.status(400).json({ erro: 'de deve ser anterior ou igual a ate' });
    if (totalMeses > 60) return res.status(400).json({ erro: 'intervalo máximo de 60 meses' });

    const meses = [];
    for (let i = 0; i <= totalMeses; i += 1) {
      meses.push(await calcularResumo(adicionarMesesCompetencia(de as string, i)));
    }

    res.json(meses);
  } catch (err) {
    next(err);
  }
});

export default router;
