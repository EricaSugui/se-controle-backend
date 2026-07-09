import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

router.get('/', autenticar, async (req, res, next) => {
  try {
    const { ativo } = req.query;
    const pessoaId = (req as any).usuario.id;
    const params: unknown[] = [pessoaId];
    let query = `
      SELECT cc.*,
        EXISTS (
          SELECT 1
          FROM casa_pessoas cp_titular
          JOIN casa_pessoas cp_user ON cp_user.casa_id = cp_titular.casa_id
          WHERE cp_titular.pessoa_id = cc.titular_id
            AND cp_user.pessoa_id = $1
            AND cp_user.papel = 'admin'
        ) AS pode_editar
      FROM cartoes_contas cc
      WHERE cc.titular_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM casa_pessoas cp_titular
          JOIN casa_pessoas cp_user ON cp_user.casa_id = cp_titular.casa_id
          WHERE cp_titular.pessoa_id = cc.titular_id
            AND cp_user.pessoa_id = $1
        )
    `;

    if (ativo !== undefined) {
      params.push(ativo === 'true');
      query += ` AND cc.ativo = $${params.length}`;
    }

    query += ' ORDER BY cc.nome';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento } = req.body;

    if (!nome || !tipo) return res.status(400).json({ erro: 'nome e tipo são obrigatórios' });
    if (tipo !== 'credito' && tipo !== 'debito') return res.status(400).json({ erro: "tipo deve ser 'credito' ou 'debito'" });

    const { rows } = await pool.query(
      `INSERT INTO cartoes_contas (nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nome, tipo, orNull(titular_id), orNull(limite), orNull(dia_fechamento), orNull(dia_vencimento)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Confere se `pessoaId` é admin em alguma casa compartilhada com o titular do registro.
async function autorizarGerenciamento(
  pessoaId: number,
  cartaoContaId: string
): Promise<'ok' | 'nao_encontrado' | 'sem_permissao'> {
  const { rows } = await pool.query('SELECT titular_id FROM cartoes_contas WHERE id = $1', [cartaoContaId]);
  if (rows.length === 0) return 'nao_encontrado';

  const titularId = rows[0].titular_id;
  if (titularId === null) return 'sem_permissao';

  const { rows: permRows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM casa_pessoas cp_titular
       JOIN casa_pessoas cp_user ON cp_user.casa_id = cp_titular.casa_id
       WHERE cp_titular.pessoa_id = $1
         AND cp_user.pessoa_id = $2
         AND cp_user.papel = 'admin'
     ) AS pode`,
    [titularId, pessoaId]
  );
  return permRows[0].pode ? 'ok' : 'sem_permissao';
}

router.put('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const autorizacao = await autorizarGerenciamento(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Registro não encontrado' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para editar este cartão/conta' });

    const { nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento } = req.body;

    if (!nome || !tipo) return res.status(400).json({ erro: 'nome e tipo são obrigatórios' });
    if (tipo !== 'credito' && tipo !== 'debito') return res.status(400).json({ erro: "tipo deve ser 'credito' ou 'debito'" });

    const { rows } = await pool.query(
      `UPDATE cartoes_contas
       SET nome = $1, tipo = $2, titular_id = $3, limite = $4, dia_fechamento = $5, dia_vencimento = $6
       WHERE id = $7 RETURNING *`,
      [nome, tipo, orNull(titular_id), orNull(limite), orNull(dia_fechamento), orNull(dia_vencimento), req.params.id]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

async function setAtivo(req: any, res: any, next: any, ativo: boolean) {
  try {
    const pessoaId = req.usuario.id;
    const autorizacao = await autorizarGerenciamento(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Registro não encontrado' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para alterar este cartão/conta' });

    const { rows } = await pool.query(
      'UPDATE cartoes_contas SET ativo = $1 WHERE id = $2 RETURNING *',
      [ativo, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

router.patch('/:id/ativar', autenticar, (req, res, next) => setAtivo(req, res, next, true));
router.patch('/:id/desativar', autenticar, (req, res, next) => setAtivo(req, res, next, false));

export default router;
