import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { ehFusoValido } from '../utils/fuso';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

router.get('/', autenticar, async (req, res, next) => {
  try {
    const { ativo } = req.query;
    const pessoaId = (req as any).usuario.id;
    const params: unknown[] = [pessoaId];
    let query = `
      SELECT DISTINCT p.*
      FROM pessoas p
      JOIN casa_pessoas cp ON cp.pessoa_id = p.id
      WHERE cp.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1)
    `;

    if (ativo !== undefined) {
      params.push(ativo === 'true');
      query += ` AND p.ativo = $${params.length}`;
    }

    query += ' ORDER BY p.nome';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/relacionadas', autenticar, async (req, res, next) => {
  try {
    const { ativo } = req.query;
    const pessoaId = (req as any).usuario.id;
    const params: unknown[] = [pessoaId];
    let query = `
      SELECT DISTINCT p.*
      FROM pessoas p
      JOIN casa_pessoas cp ON cp.pessoa_id = p.id
      WHERE cp.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1)
    `;

    if (ativo !== undefined) {
      params.push(ativo === 'true');
      query += ` AND p.ativo = $${params.length}`;
    }

    query += ' ORDER BY p.nome';
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
      `SELECT p.* FROM pessoas p
       WHERE p.id = $1
         AND (p.id = $2 OR p.id IN (
           SELECT cp.pessoa_id FROM casa_pessoas cp
           WHERE cp.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $2)
         ))`,
      [req.params.id, pessoaId]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Pessoa não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const { nome, email } = req.body;
    if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

    const { rows } = await pool.query(
      'INSERT INTO pessoas (nome, email) VALUES ($1, $2) RETURNING *',
      [nome, orNull(email)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    if (Number(req.params.id) !== pessoaId) {
      return res.status(403).json({ erro: 'Você só pode editar seus próprios dados' });
    }

    const { nome, email, fuso_horario } = req.body;
    if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

    // fuso_horario é opcional: omitido, mantém o atual (IANA, ex: America/Manaus)
    if (fuso_horario !== undefined && fuso_horario !== null && !ehFusoValido(fuso_horario)) {
      return res.status(400).json({ erro: `fuso_horario inválido: ${fuso_horario} (use um fuso IANA, ex: America/Sao_Paulo)` });
    }

    // email OMITIDO mantém o atual (o replace antigo apagava sem querer);
    // null explícito limpa — mesma distinção undefined/null da herança
    const { rows } = await pool.query(
      `UPDATE pessoas
       SET nome = $1,
           email = CASE WHEN $2 THEN $3::varchar ELSE email END,
           fuso_horario = COALESCE($4, fuso_horario)
       WHERE id = $5 RETURNING *`,
      [nome, email !== undefined, orNull(email), orNull(fuso_horario), req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Pessoa não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
