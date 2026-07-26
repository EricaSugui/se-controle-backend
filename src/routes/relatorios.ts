import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { calcularRelatorioGastos } from '../services/relatorioGastos';
import { adicionarMesesCompetencia, dataParaCompetencia, ehCompetenciaValida, mesesEntre } from '../utils/competencia';
import { hojeNoFuso } from '../utils/fuso';

const router = Router();

router.get('/gastos', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { casa_id, de, ate, eixo } = req.query;

    if (!casa_id) return res.status(400).json({ erro: 'casa_id é obrigatório' });

    if (eixo !== undefined && eixo !== 'competencia' && eixo !== 'caixa') {
      return res.status(400).json({ erro: "eixo deve ser 'competencia' ou 'caixa'" });
    }
    if (de !== undefined && !ehCompetenciaValida(de)) {
      return res.status(400).json({ erro: `de inválido: ${de} (formato MMM-AA, ex.: JUL-26)` });
    }
    if (ate !== undefined && !ehCompetenciaValida(ate)) {
      return res.status(400).json({ erro: `ate inválido: ${ate} (formato MMM-AA, ex.: JUL-26)` });
    }

    const { rows: membroRows } = await pool.query(
      'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
      [casa_id, pessoaId]
    );
    if (membroRows.length === 0) return res.status(403).json({ erro: 'Você não participa desta casa' });

    // default: janela de 6 meses terminando na competência atual (fuso do usuário)
    const ateEfetivo = (ate as string) ?? dataParaCompetencia(hojeNoFuso((req as any).usuario.fuso_horario));
    const deEfetivo = (de as string) ?? adicionarMesesCompetencia(ateEfetivo, -5);

    if (mesesEntre(deEfetivo, ateEfetivo) < 0) {
      return res.status(400).json({ erro: 'de deve ser anterior ou igual a ate' });
    }

    const relatorio = await calcularRelatorioGastos(
      Number(casa_id), deEfetivo, ateEfetivo, (eixo as 'competencia' | 'caixa') ?? 'competencia'
    );
    res.json(relatorio);
  } catch (err) {
    next(err);
  }
});

export default router;
