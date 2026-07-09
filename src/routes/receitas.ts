import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

const SELECT_BASE = `
  SELECT r.*, p.nome AS pessoa_nome, o.nome AS origem_nome
  FROM receitas r
  LEFT JOIN pessoas p ON p.id = r.pessoa_id
  LEFT JOIN origens_receita o ON o.id = r.origem_id
`;

function podeEditarExpr(paramIndex: number): string {
  return `(r.lancado_por_id = $${paramIndex} OR EXISTS (
    SELECT 1 FROM casa_pessoas WHERE casa_id = r.casa_id AND pessoa_id = $${paramIndex} AND papel = 'admin'
  )) AS pode_editar`;
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const { competencia } = req.query;
    const pessoaId = (req as any).usuario.id;
    const params: unknown[] = [pessoaId];
    let query = `
      SELECT r.*, p.nome AS pessoa_nome, o.nome AS origem_nome, ${podeEditarExpr(1)}
      FROM receitas r
      LEFT JOIN pessoas p ON p.id = r.pessoa_id
      LEFT JOIN origens_receita o ON o.id = r.origem_id
      WHERE r.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1)
    `;

    if (competencia !== undefined) {
      params.push(competencia);
      query += ` AND r.competencia = $${params.length}`;
    }

    query += ' ORDER BY r.data';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(
      `${SELECT_BASE}, ${podeEditarExpr(2)}
       WHERE r.id = $1
         AND r.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $2)`,
      [req.params.id, pessoaId]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Receita não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const { casa_id, pessoa_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia } = req.body;
    const pessoaId = (req as any).usuario.id;

    if (!casa_id || valor_liquido === undefined) {
      return res.status(400).json({ erro: 'casa_id e valor_liquido são obrigatórios' });
    }

    const { rows: membroRows } = await pool.query(
      'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
      [casa_id, pessoaId]
    );
    if (membroRows.length === 0) return res.status(403).json({ erro: 'Você não é membro desta casa' });

    // lancado_por_id é sempre o usuário autenticado, nunca o valor enviado pelo cliente
    const { rows } = await pool.query(
      `INSERT INTO receitas
         (casa_id, pessoa_id, lancado_por_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [casa_id, orNull(pessoa_id), pessoaId, orNull(origem_id), orNull(observacao), orNull(valor_bruto), orNull(descontos), valor_liquido, orNull(data), orNull(competencia)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Confere se `pessoaId` registrou a receita ou é admin na casa dela.
async function autorizarGerenciamento(
  pessoaId: number,
  receitaId: string
): Promise<'ok' | 'nao_encontrado' | 'sem_permissao'> {
  const { rows } = await pool.query('SELECT casa_id, lancado_por_id FROM receitas WHERE id = $1', [receitaId]);
  if (rows.length === 0) return 'nao_encontrado';

  const { casa_id, lancado_por_id } = rows[0];
  if (lancado_por_id === pessoaId) return 'ok';

  const { rows: permRows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'
     ) AS pode`,
    [casa_id, pessoaId]
  );
  return permRows[0].pode ? 'ok' : 'sem_permissao';
}

router.put('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const autorizacao = await autorizarGerenciamento(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Receita não encontrada' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para editar esta receita' });

    const { casa_id, pessoa_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia } = req.body;

    if (!casa_id || valor_liquido === undefined) {
      return res.status(400).json({ erro: 'casa_id e valor_liquido são obrigatórios' });
    }

    // lancado_por_id não é alterável — permanece com quem registrou originalmente
    const { rows } = await pool.query(
      `UPDATE receitas
       SET casa_id = $1, pessoa_id = $2, origem_id = $3, observacao = $4,
           valor_bruto = $5, descontos = $6, valor_liquido = $7, data = $8, competencia = $9
       WHERE id = $10 RETURNING *`,
      [casa_id, orNull(pessoa_id), orNull(origem_id), orNull(observacao), orNull(valor_bruto), orNull(descontos), valor_liquido, orNull(data), orNull(competencia), req.params.id]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const autorizacao = await autorizarGerenciamento(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Receita não encontrada' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para excluir esta receita' });

    await pool.query('DELETE FROM receitas WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
