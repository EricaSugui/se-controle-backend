import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

export default function createLookupRouter(tableName: string): Router {
  const router = Router();

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

  return router;
}
