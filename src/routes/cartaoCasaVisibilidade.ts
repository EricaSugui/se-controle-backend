import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router({ mergeParams: true });

async function ehTitular(pessoaId: number, cartaoId: string): Promise<'ok' | 'nao_encontrado' | 'sem_permissao'> {
  const { rows } = await pool.query('SELECT titular_id FROM cartoes_contas WHERE id = $1', [cartaoId]);
  if (rows.length === 0) return 'nao_encontrado';
  return rows[0].titular_id === pessoaId ? 'ok' : 'sem_permissao';
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const cartaoId = (req.params as any).cartaoId;

    const { rows: cartaoRows } = await pool.query('SELECT titular_id FROM cartoes_contas WHERE id = $1', [cartaoId]);
    if (cartaoRows.length === 0) return res.status(404).json({ erro: 'Cartão/conta não encontrado' });

    const souTitular = cartaoRows[0].titular_id === pessoaId;
    const params: unknown[] = [cartaoId];
    let query = 'SELECT * FROM cartao_casa_visibilidade WHERE cartao_id = $1';
    if (!souTitular) {
      params.push(pessoaId);
      query += ` AND casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $${params.length})`;
    }
    query += ' ORDER BY casa_id';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const cartaoId = (req.params as any).cartaoId;
    const autorizacao = await ehTitular(pessoaId, cartaoId);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Cartão/conta não encontrado' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Apenas o titular pode gerenciar a visibilidade deste cartão' });

    const { casa_id, compartilhado, compartilha_saldo } = req.body;
    if (!casa_id) return res.status(400).json({ erro: 'casa_id é obrigatório' });
    if (compartilha_saldo !== undefined && typeof compartilha_saldo !== 'boolean') {
      return res.status(400).json({ erro: 'compartilha_saldo deve ser um booleano' });
    }

    const { rows } = await pool.query(
      `INSERT INTO cartao_casa_visibilidade (cartao_id, casa_id, compartilhado, compartilha_saldo) VALUES ($1, $2, $3, $4) RETURNING *`,
      [cartaoId, casa_id, compartilhado === true, compartilha_saldo === true]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as any).code === '23505') return res.status(409).json({ erro: 'Já existe uma entrada de visibilidade para esta casa' });
    next(err);
  }
});

router.patch('/:casaId', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const cartaoId = (req.params as any).cartaoId;
    const autorizacao = await ehTitular(pessoaId, cartaoId);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Cartão/conta não encontrado' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Apenas o titular pode gerenciar a visibilidade deste cartão' });

    const { compartilhado, compartilha_saldo } = req.body;
    if (compartilhado === undefined && compartilha_saldo === undefined) {
      return res.status(400).json({ erro: 'informe compartilhado e/ou compartilha_saldo (boolean)' });
    }
    if (compartilhado !== undefined && typeof compartilhado !== 'boolean') {
      return res.status(400).json({ erro: 'compartilhado deve ser um booleano' });
    }
    if (compartilha_saldo !== undefined && typeof compartilha_saldo !== 'boolean') {
      return res.status(400).json({ erro: 'compartilha_saldo deve ser um booleano' });
    }

    // omitido mantém o valor atual — os dois consentimentos são independentes
    const { rows } = await pool.query(
      `UPDATE cartao_casa_visibilidade
       SET compartilhado = COALESCE($1, compartilhado), compartilha_saldo = COALESCE($2, compartilha_saldo)
       WHERE cartao_id = $3 AND casa_id = $4 RETURNING *`,
      [compartilhado ?? null, compartilha_saldo ?? null, cartaoId, req.params.casaId]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Entrada de visibilidade não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:casaId', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const cartaoId = (req.params as any).cartaoId;
    const autorizacao = await ehTitular(pessoaId, cartaoId);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Cartão/conta não encontrado' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Apenas o titular pode gerenciar a visibilidade deste cartão' });

    const { rows } = await pool.query(
      'DELETE FROM cartao_casa_visibilidade WHERE cartao_id = $1 AND casa_id = $2 RETURNING id',
      [cartaoId, req.params.casaId]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Entrada de visibilidade não encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
