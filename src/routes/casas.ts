import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router();

async function adminCasa(pessoaId: number, casaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'`,
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const { ativo } = req.query;
    const params: unknown[] = [];
    let query = 'SELECT * FROM casas';

    if (ativo !== undefined) {
      params.push(ativo === 'true');
      query += ' WHERE ativo = $1';
    }

    query += ' ORDER BY nome';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: casaRows } = await client.query(
        'INSERT INTO casas (nome) VALUES ($1) RETURNING *',
        [nome]
      );
      const casa = casaRows[0];

      await client.query(
        `INSERT INTO casa_pessoas (casa_id, pessoa_id, papel) VALUES ($1, $2, 'admin')`,
        [casa.id, pessoaId]
      );

      await client.query('COMMIT');
      res.status(201).json(casa);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if ((err as any).code === '23505') return res.status(409).json({ erro: 'Já existe uma casa com esse nome' });
    next(err);
  }
});

router.put('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    if (!(await adminCasa(pessoaId, req.params.id))) {
      return res.status(403).json({ erro: 'Apenas admins da casa podem editá-la' });
    }

    const { nome, acerto_eixo } = req.body;
    if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });
    if (acerto_eixo !== undefined && acerto_eixo !== 'competencia' && acerto_eixo !== 'caixa') {
      return res.status(400).json({ erro: "acerto_eixo deve ser 'competencia' ou 'caixa'" });
    }

    // acerto_eixo omitido preserva o valor atual (padrão do PUT /pessoas com email)
    const { rows } = await pool.query(
      'UPDATE casas SET nome = $1, acerto_eixo = COALESCE($2, acerto_eixo) WHERE id = $3 RETURNING *',
      [nome, acerto_eixo ?? null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Casa não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

async function setAtivo(req: any, res: any, next: any, ativo: boolean) {
  try {
    const pessoaId = req.usuario.id;
    if (!(await adminCasa(pessoaId, req.params.id))) {
      return res.status(403).json({ erro: 'Apenas admins da casa podem ativá-la/desativá-la' });
    }

    const { rows } = await pool.query('UPDATE casas SET ativo = $1 WHERE id = $2 RETURNING *', [ativo, req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Casa não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

router.patch('/:id/ativar', autenticar, (req, res, next) => setAtivo(req, res, next, true));
router.patch('/:id/desativar', autenticar, (req, res, next) => setAtivo(req, res, next, false));

export default router;
