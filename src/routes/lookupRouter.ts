import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db';
import { autenticar, adminSistema } from '../middleware/auth';

// camposBooleanosExtras: colunas booleanas opcionais além do nome (hoje só
// formas_pagamento usa, com exige_conta). Omitidas no POST, ficam no default
// da coluna; no PUT, mantêm o valor atual.
export default function createLookupRouter(tableName: string, camposBooleanosExtras: string[] = []): Router {
  const router = Router();

  function validarCamposExtras(body: any): string | null {
    for (const campo of camposBooleanosExtras) {
      const valor = body[campo];
      if (valor !== undefined && valor !== null && typeof valor !== 'boolean') {
        return `${campo} deve ser um booleano`;
      }
    }
    return null;
  }

  router.get('/', autenticar, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ativo } = req.query;
      const params: unknown[] = [];
      let query = `SELECT * FROM ${tableName}`;

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

  router.post('/', autenticar, adminSistema, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nome } = req.body;
      if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

      const erroExtras = validarCamposExtras(req.body);
      if (erroExtras) return res.status(400).json({ erro: erroExtras });

      const extrasPresentes = camposBooleanosExtras.filter((campo) => req.body[campo] !== undefined && req.body[campo] !== null);
      const colunas = ['nome', ...extrasPresentes];
      const valores = [req.body.nome, ...extrasPresentes.map((campo) => req.body[campo])];
      const placeholders = colunas.map((_, i) => `$${i + 1}`).join(', ');

      const { rows } = await pool.query(
        `INSERT INTO ${tableName} (${colunas.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        valores
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if ((err as any).code === '23505') return res.status(409).json({ erro: 'Já existe um registro com esse nome' });
      next(err);
    }
  });

  router.put('/:id', autenticar, adminSistema, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nome } = req.body;
      if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

      const erroExtras = validarCamposExtras(req.body);
      if (erroExtras) return res.status(400).json({ erro: erroExtras });

      // extras omitidos mantêm o valor atual (COALESCE)
      const sets = ['nome = $1', ...camposBooleanosExtras.map((campo, i) => `${campo} = COALESCE($${i + 2}, ${campo})`)];
      const valores: unknown[] = [nome, ...camposBooleanosExtras.map((campo) => req.body[campo] ?? null)];
      valores.push(req.params.id);

      const { rows } = await pool.query(
        `UPDATE ${tableName} SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING *`,
        valores
      );
      if (rows.length === 0) return res.status(404).json({ erro: 'Registro não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      if ((err as any).code === '23505') return res.status(409).json({ erro: 'Já existe um registro com esse nome' });
      next(err);
    }
  });

  async function setAtivo(req: Request, res: Response, next: NextFunction, ativo: boolean) {
    try {
      const { rows } = await pool.query(
        `UPDATE ${tableName} SET ativo = $1 WHERE id = $2 RETURNING *`,
        [ativo, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ erro: 'Registro não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  }

  router.patch('/:id/ativar', autenticar, adminSistema, (req, res, next) => setAtivo(req, res, next, true));
  router.patch('/:id/desativar', autenticar, adminSistema, (req, res, next) => setAtivo(req, res, next, false));

  return router;
}
