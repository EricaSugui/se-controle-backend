import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';

const router = Router();
const PERFIS = ['individual', 'responsavel', 'convidado'];
const ETAPAS = ['intencao', 'casa', 'essencial', 'primeiro_gasto', 'resultado'];
const STATUS = ['not_started', 'in_progress', 'dismissed', 'completed'];

function valorValido(valor: unknown, permitidos: string[]): valor is string {
  return typeof valor === 'string' && permitidos.includes(valor);
}

function estadoInicial(pessoaId: number) {
  return {
    pessoa_id: pessoaId,
    perfil: null,
    etapa_atual: 'intencao',
    status: 'not_started',
    dispensado_em: null,
    concluido_em: null,
  };
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(
      `SELECT pessoa_id, perfil, etapa_atual, status, dispensado_em, concluido_em,
              created_at, updated_at
       FROM onboarding_pessoas WHERE pessoa_id = $1`,
      [pessoaId]
    );
    res.json(rows[0] ?? estadoInicial(pessoaId));
  } catch (err) {
    next(err);
  }
});

router.put('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { perfil, etapa_atual, status } = req.body;

    if (perfil !== undefined && perfil !== null && !valorValido(perfil, PERFIS)) {
      return res.status(400).json({ erro: `perfil deve ser um de: ${PERFIS.join(', ')}` });
    }
    if (etapa_atual !== undefined && !valorValido(etapa_atual, ETAPAS)) {
      return res.status(400).json({ erro: `etapa_atual deve ser uma de: ${ETAPAS.join(', ')}` });
    }
    if (status !== undefined && !valorValido(status, STATUS)) {
      return res.status(400).json({ erro: `status deve ser um de: ${STATUS.join(', ')}` });
    }

    const { rows } = await pool.query(
      `INSERT INTO onboarding_pessoas (pessoa_id, perfil, etapa_atual, status, dispensado_em, concluido_em)
       VALUES ($1, $2, COALESCE($3, 'intencao'), COALESCE($4, 'not_started'),
               CASE WHEN $4 = 'dismissed' THEN now() ELSE NULL END,
               CASE WHEN $4 = 'completed' THEN now() ELSE NULL END)
       ON CONFLICT (pessoa_id) DO UPDATE SET
         perfil = COALESCE(EXCLUDED.perfil, onboarding_pessoas.perfil),
         etapa_atual = COALESCE($3, onboarding_pessoas.etapa_atual),
         status = COALESCE($4, onboarding_pessoas.status),
         dispensado_em = CASE WHEN $4 = 'dismissed' THEN now() ELSE onboarding_pessoas.dispensado_em END,
         concluido_em = CASE WHEN $4 = 'completed' THEN now() ELSE onboarding_pessoas.concluido_em END,
         updated_at = now()
       RETURNING pessoa_id, perfil, etapa_atual, status, dispensado_em, concluido_em, created_at, updated_at`,
      [pessoaId, perfil ?? null, etapa_atual ?? null, status ?? null]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/dispensar', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(
      `INSERT INTO onboarding_pessoas (pessoa_id, status, dispensado_em)
       VALUES ($1, 'dismissed', now())
       ON CONFLICT (pessoa_id) DO UPDATE SET status = 'dismissed', dispensado_em = now(), updated_at = now()
       RETURNING pessoa_id, perfil, etapa_atual, status, dispensado_em, concluido_em, created_at, updated_at`,
      [pessoaId]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/reabrir', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(
      `INSERT INTO onboarding_pessoas (pessoa_id, status, etapa_atual)
       VALUES ($1, 'in_progress', 'intencao')
       ON CONFLICT (pessoa_id) DO UPDATE SET status = 'in_progress', etapa_atual = 'intencao',
         dispensado_em = NULL, concluido_em = NULL, updated_at = now()
       RETURNING pessoa_id, perfil, etapa_atual, status, dispensado_em, concluido_em, created_at, updated_at`,
      [pessoaId]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
