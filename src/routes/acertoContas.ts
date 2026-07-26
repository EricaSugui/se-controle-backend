import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { calcularAcerto } from '../services/acertoContas';
import { ehNumeroValido } from '../utils/numero';

const router = Router({ mergeParams: true });

async function participaCasa(pessoaId: number, casaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

function ehDataValida(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !isNaN(Date.parse(valor));
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = (req.params as any).casaId;
    if (!(await participaCasa(pessoaId, casaId))) {
      return res.status(403).json({ erro: 'Você não participa desta casa' });
    }

    const acerto = await calcularAcerto(Number(casaId));
    if (acerto === null) return res.status(404).json({ erro: 'Casa não encontrada' });
    res.json(acerto);
  } catch (err) {
    next(err);
  }
});

router.post('/pagamentos', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = (req.params as any).casaId;
    if (!(await participaCasa(pessoaId, casaId))) {
      return res.status(403).json({ erro: 'Você não participa desta casa' });
    }

    const { de_pessoa_id, para_pessoa_id, valor, data, observacao } = req.body;

    if (!de_pessoa_id || !para_pessoa_id || valor === undefined || !data) {
      return res.status(400).json({ erro: 'de_pessoa_id, para_pessoa_id, valor e data são obrigatórios' });
    }
    if (!ehNumeroValido(valor) || Number(valor) <= 0) {
      return res.status(400).json({ erro: 'valor deve ser um número maior que zero' });
    }
    if (!ehDataValida(data)) {
      return res.status(400).json({ erro: 'data deve estar no formato AAAA-MM-DD' });
    }
    if (Number(de_pessoa_id) === Number(para_pessoa_id)) {
      return res.status(400).json({ erro: 'de_pessoa_id e para_pessoa_id devem ser pessoas diferentes' });
    }

    const { rows: participantes } = await pool.query(
      'SELECT pessoa_id FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = ANY($2)',
      [casaId, [de_pessoa_id, para_pessoa_id]]
    );
    if (participantes.length < 2) {
      return res.status(400).json({ erro: 'de_pessoa_id e para_pessoa_id devem participar da casa' });
    }

    const { rows } = await pool.query(
      `INSERT INTO acerto_pagamentos (casa_id, de_pessoa_id, para_pessoa_id, valor, data, observacao, lancado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [casaId, de_pessoa_id, para_pessoa_id, valor, data, observacao ?? null, pessoaId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/pagamentos/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = (req.params as any).casaId;

    const { rows } = await pool.query(
      'SELECT lancado_por_id FROM acerto_pagamentos WHERE id = $1 AND casa_id = $2',
      [req.params.id, casaId]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Pagamento não encontrado' });

    if (rows[0].lancado_por_id !== pessoaId) {
      const { rows: adminRows } = await pool.query(
        `SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'`,
        [casaId, pessoaId]
      );
      if (adminRows.length === 0) {
        return res.status(403).json({ erro: 'Apenas quem registrou o pagamento ou um admin da casa pode excluí-lo' });
      }
    }

    await pool.query('DELETE FROM acerto_pagamentos WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
