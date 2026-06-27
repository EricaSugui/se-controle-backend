import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db';

export default function createLookupRouter(tableName: string): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
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

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nome } = req.body;
      if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

      const { rows } = await pool.query(
        `INSERT INTO ${tableName} (nome) VALUES ($1) RETURNING *`,
        [nome]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nome } = req.body;
      if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

      const { rows } = await pool.query(
        `UPDATE ${tableName} SET nome = $1 WHERE id = $2 RETURNING *`,
        [nome, req.params.id]
      );

      if (rows.length === 0) return res.status(404).json({ erro: 'Registro não encontrado' });
      res.json(rows[0]);
    } catch (err) {
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

  router.patch('/:id/ativar', (req, res, next) => setAtivo(req, res, next, true));
  router.patch('/:id/desativar', (req, res, next) => setAtivo(req, res, next, false));

  return router;
}
