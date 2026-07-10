import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

function validarPessoaOuCasa(pessoa_id: unknown, casa_id: unknown): string | null {
  const temPessoa = pessoa_id !== undefined && pessoa_id !== null;
  const temCasa = casa_id !== undefined && casa_id !== null;
  if (temPessoa === temCasa) return 'informe exatamente um entre pessoa_id e casa_id';
  return null;
}

async function autorizarLeitura(pessoaId: number, casaId: number | null, metaPessoaId: number | null): Promise<boolean> {
  if (metaPessoaId !== null) return metaPessoaId === pessoaId;
  const { rows } = await pool.query('SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2', [casaId, pessoaId]);
  return rows.length > 0;
}

async function autorizarEscrita(pessoaId: number, casaId: number | null, metaPessoaId: number | null): Promise<boolean> {
  if (metaPessoaId !== null) return metaPessoaId === pessoaId;
  const { rows } = await pool.query(
    `SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'`,
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(
      `SELECT * FROM metas
       WHERE pessoa_id = $1
          OR casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1)
       ORDER BY id`,
      [pessoaId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query('SELECT * FROM metas WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Meta não encontrada' });

    const meta = rows[0];
    if (!(await autorizarLeitura(pessoaId, meta.casa_id, meta.pessoa_id))) {
      return res.status(404).json({ erro: 'Meta não encontrada' });
    }
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { objetivo, valor_atual, meta, falta, pessoa_id, casa_id } = req.body;
    if (!objetivo) return res.status(400).json({ erro: 'objetivo é obrigatório' });

    const erroXor = validarPessoaOuCasa(pessoa_id, casa_id);
    if (erroXor) return res.status(400).json({ erro: erroXor });

    if (!(await autorizarEscrita(pessoaId, casa_id ?? null, pessoa_id ?? null))) {
      return res.status(403).json({ erro: 'Você não tem permissão para criar meta neste escopo' });
    }

    const { rows } = await pool.query(
      `INSERT INTO metas (objetivo, valor_atual, meta, falta, pessoa_id, casa_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [objetivo, orNull(valor_atual), orNull(meta), orNull(falta), orNull(pessoa_id), orNull(casa_id)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows: existentes } = await pool.query('SELECT * FROM metas WHERE id = $1', [req.params.id]);
    if (existentes.length === 0) return res.status(404).json({ erro: 'Meta não encontrada' });

    const atual = existentes[0];
    if (!(await autorizarEscrita(pessoaId, atual.casa_id, atual.pessoa_id))) {
      return res.status(403).json({ erro: 'Você não tem permissão para editar esta meta' });
    }

    const { objetivo, valor_atual, meta, falta } = req.body;
    if (!objetivo) return res.status(400).json({ erro: 'objetivo é obrigatório' });
    // pessoa_id/casa_id não são alteráveis via PUT — escopo fixo desde a criação

    const { rows } = await pool.query(
      'UPDATE metas SET objetivo = $1, valor_atual = $2, meta = $3, falta = $4 WHERE id = $5 RETURNING *',
      [objetivo, orNull(valor_atual), orNull(meta), orNull(falta), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows: existentes } = await pool.query('SELECT * FROM metas WHERE id = $1', [req.params.id]);
    if (existentes.length === 0) return res.status(404).json({ erro: 'Meta não encontrada' });

    const atual = existentes[0];
    if (!(await autorizarEscrita(pessoaId, atual.casa_id, atual.pessoa_id))) {
      return res.status(403).json({ erro: 'Você não tem permissão para excluir esta meta' });
    }

    await pool.query('DELETE FROM metas WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
