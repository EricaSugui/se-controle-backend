import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router();
function orNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

async function autorizarTitular(
  pessoaId: number,
  faturaId: string
): Promise<'ok' | 'nao_encontrado' | 'sem_permissao'> {
  const { rows } = await pool.query(
    `SELECT cc.titular_id
     FROM faturas f
     JOIN cartoes_contas cc ON cc.id = f.cartao_conta_id
     WHERE f.id = $1`,
    [faturaId]
  );
  if (rows.length === 0) return 'nao_encontrado';
  return rows[0].titular_id === pessoaId ? 'ok' : 'sem_permissao';
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { cartao_conta_id } = req.query;
    const params: unknown[] = [pessoaId];
    let query = `
      SELECT f.*
      FROM faturas f
      JOIN cartoes_contas cc ON cc.id = f.cartao_conta_id
      WHERE cc.titular_id = $1
    `;

    if (cartao_conta_id !== undefined) {
      params.push(cartao_conta_id);
      query += ` AND f.cartao_conta_id = $${params.length}`;
    }

    query += ' ORDER BY f.data_vencimento DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const autorizacao = await autorizarTitular(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Fatura não encontrada' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para ver esta fatura' });

    const { rows: faturaRows } = await pool.query('SELECT * FROM faturas WHERE id = $1', [req.params.id]);
    const { rows: parcelaRows } = await pool.query(
      'SELECT * FROM parcelas_com_caixa WHERE fatura_id = $1 ORDER BY data_compra',
      [req.params.id]
    );

    res.json({ ...faturaRows[0], parcelas: parcelaRows });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const autorizacao = await autorizarTitular(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Fatura não encontrada' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para editar esta fatura' });

    const { data_abertura, data_fechamento, data_vencimento } = req.body;
    if (!data_fechamento || !data_vencimento) {
      return res.status(400).json({ erro: 'data_fechamento e data_vencimento são obrigatórios' });
    }

    const { rows } = await pool.query(
      `UPDATE faturas SET data_abertura = $1, data_fechamento = $2, data_vencimento = $3 WHERE id = $4 RETURNING *`,
      [orNull(data_abertura), data_fechamento, data_vencimento, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if ((err as any).code === '23514') {
      return res.status(400).json({ erro: 'Datas inválidas: fechamento deve ser antes do vencimento (e abertura antes ou igual ao fechamento)' });
    }
    next(err);
  }
});

export default router;
