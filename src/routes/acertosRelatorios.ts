import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import {
  confirmarAcerto,
  gerarCsvRelatorio,
  gerarPdfRelatorio,
  listarAcertos,
  obterAcerto,
} from '../services/relatorioAcerto';

const router = Router({ mergeParams: true });

async function participaCasa(pessoaId: number, casaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

async function podeVisualizarAcertos(pessoaId: number, casaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
     WHERE EXISTS (
       SELECT 1 FROM casa_pessoas
       WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'
     )
     OR EXISTS (
       SELECT 1 FROM acerto_participantes ap
       JOIN acertos a ON a.id = ap.acerto_id
       WHERE a.casa_id = $1 AND ap.pessoa_id = $2
     )
     OR EXISTS (
       SELECT 1
       FROM compra_pagadores cp
       JOIN compras c ON c.id = cp.compra_id
       WHERE c.casa_id = $1 AND cp.pessoa_id = $2
     )
     OR EXISTS (
       SELECT 1 FROM percentuais_custeio
       WHERE casa_id = $1 AND pessoa_id = $2
     )`,
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

function responderErro(err: unknown, res: any, next: any): void {
  const status = (err as { status?: number }).status;
  if (status) {
    res.status(status).json({ erro: (err as Error).message });
    return;
  }
  next(err);
}

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const casaId = Number(req.params.casaId);
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey?.trim()) {
      return res.status(400).json({ erro: 'Idempotency-Key é obrigatório' });
    }
    if (!(await participaCasa(pessoaId, String(casaId)))) {
      return res.status(403).json({ erro: 'Você não participa desta casa' });
    }
    const relatorio = await confirmarAcerto(casaId, pessoaId, idempotencyKey.trim());
    res.status(201).json(relatorio);
  } catch (err) {
    responderErro(err, res, next);
  }
});

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    if (!(await podeVisualizarAcertos(pessoaId, req.params.casaId))) {
      return res.status(403).json({ erro: 'Você não tem permissão para visualizar os acertos desta casa' });
    }
    res.json(await listarAcertos(Number(req.params.casaId)));
  } catch (err) {
    responderErro(err, res, next);
  }
});

router.get('/:acertoId', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    if (!(await podeVisualizarAcertos(pessoaId, req.params.casaId))) {
      return res.status(403).json({ erro: 'Você não tem permissão para visualizar este acerto' });
    }
    res.json(await obterAcerto(Number(req.params.casaId), Number(req.params.acertoId)));
  } catch (err) {
    responderErro(err, res, next);
  }
});

router.get('/:acertoId/arquivo', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const formato = req.query.formato;
    if (formato !== 'pdf' && formato !== 'csv') {
      return res.status(400).json({ erro: "formato deve ser 'pdf' ou 'csv'" });
    }
    if (!(await podeVisualizarAcertos(pessoaId, req.params.casaId))) {
      return res.status(403).json({ erro: 'Você não tem permissão para visualizar este acerto' });
    }

    const relatorio = await obterAcerto(Number(req.params.casaId), Number(req.params.acertoId));
    const nomeArquivo = `${relatorio.nome_arquivo_base}.${formato}`;
    let conteudo: Buffer | string;
    try {
      conteudo = formato === 'pdf'
        ? await gerarPdfRelatorio(relatorio)
        : gerarCsvRelatorio(relatorio);
    } catch (error) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO acerto_arquivos
            (acerto_id, formato, nome_arquivo, mime_type, gerado_por_id, status, erro)
           VALUES ($1, $2, $3, $4, $5, 'erro', $6)`,
          [relatorio.id, formato, nomeArquivo, formato === 'pdf' ? 'application/pdf' : 'text/csv',
            pessoaId, error instanceof Error ? error.message : 'Erro desconhecido']
        );
        await client.query(
          `INSERT INTO acerto_eventos (acerto_id, tipo, pessoa_id, metadados)
           VALUES ($1, $2, $3, $4)`,
          [relatorio.id, formato === 'pdf' ? 'pdf_erro' : 'csv_erro', pessoaId,
            JSON.stringify({ nome_arquivo: nomeArquivo })]
        );
        await client.query('COMMIT');
      } catch (registroErro) {
        await client.query('ROLLBACK');
        next(registroErro);
        return;
      } finally {
        client.release();
      }
      next(error);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO acerto_arquivos
          (acerto_id, formato, nome_arquivo, mime_type, gerado_por_id, status)
         VALUES ($1, $2, $3, $4, $5, 'disponivel')`,
        [relatorio.id, formato, nomeArquivo, formato === 'pdf' ? 'application/pdf' : 'text/csv', pessoaId]
      );
      await client.query(
        `INSERT INTO acerto_eventos (acerto_id, tipo, pessoa_id, metadados)
         VALUES ($1, $2, $3, $4)`,
        [relatorio.id, formato === 'pdf' ? 'pdf_gerado' : 'csv_gerado', pessoaId, JSON.stringify({ nome_arquivo: nomeArquivo })]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.attachment(nomeArquivo);
    res.type(formato === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8').send(conteudo);
  } catch (err) {
    responderErro(err, res, next);
  }
});

export default router;
