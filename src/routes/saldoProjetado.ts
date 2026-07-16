import { Router } from 'express';
import { autenticar } from '../middleware/auth';
import { calcularSaldoProjetado } from '../services/saldoProjetado';

const router = Router();

function ehDataValida(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !isNaN(Date.parse(valor));
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { ate } = req.query;

    if (ate !== undefined && !ehDataValida(ate)) {
      return res.status(400).json({ erro: 'ate deve estar no formato AAAA-MM-DD' });
    }

    const projecao = await calcularSaldoProjetado(pessoaId, {
      ate: ate as string | undefined,
      fusoHorario: (req as any).usuario.fuso_horario,
    });
    res.json(projecao);
  } catch (err) {
    next(err);
  }
});

export default router;
