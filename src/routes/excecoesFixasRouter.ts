import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { dataParaCompetencia, ehCompetenciaValida, mesesEntre } from '../utils/competencia';
import { ehNumeroValido } from '../utils/numero';

interface ConfigExcecoes {
  tabelaPai: string; // despesas_fixas | receitas_fixas
  tabelaExcecao: string; // despesa_fixa_excecoes | receita_fixa_excecoes
  fkPai: string; // despesa_fixa_id | receita_fixa_id
  campoValorEsperadoPai: string; // valor_referencia | valor_esperado
  nomePai: string; // para mensagens: 'Despesa fixa' | 'Receita fixa'
}

// Rotas de exceções pontuais de um contrato fixo, aninhadas em
// /despesas-fixas/:id/excecoes e /receitas-fixas/:id/excecoes.
// Exceção = competência que não terá o lançamento normal (isenção, carência)
// ou anotação de desvio de valor. Autorização deriva do contrato pai.
export default function createExcecoesRouter(config: ConfigExcecoes): Router {
  const { tabelaPai, tabelaExcecao, fkPai, campoValorEsperadoPai, nomePai } = config;
  const router = Router({ mergeParams: true });

  async function buscarPai(paiId: string) {
    const { rows } = await pool.query(
      `SELECT id, casa_id, pessoa_id, periodicidade, ${campoValorEsperadoPai} AS valor_esperado_pai,
              vigente_desde::text AS vigente_desde, vigente_ate::text AS vigente_ate
       FROM ${tabelaPai} WHERE id = $1`,
      [paiId]
    );
    return rows[0] ?? null;
  }

  async function autorizarLeitura(pessoaId: number, pai: any): Promise<boolean> {
    if (pai.pessoa_id !== null) return pai.pessoa_id === pessoaId;
    const { rows } = await pool.query('SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2', [pai.casa_id, pessoaId]);
    return rows.length > 0;
  }

  async function autorizarEscrita(pessoaId: number, pai: any): Promise<boolean> {
    if (pai.pessoa_id !== null) return pai.pessoa_id === pessoaId;
    const { rows } = await pool.query(
      `SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'`,
      [pai.casa_id, pessoaId]
    );
    return rows.length > 0;
  }

  function validarCompetenciaDoPai(pai: any, competencia: unknown): string | null {
    if (!ehCompetenciaValida(competencia)) return `competencia_referencia inválida: ${competencia}`;

    const competenciaInicio = dataParaCompetencia(pai.vigente_desde);
    const mesesDesdeInicio = mesesEntre(competenciaInicio, competencia);
    const foraDoFim = pai.vigente_ate !== null && mesesEntre(competencia, dataParaCompetencia(pai.vigente_ate)) < 0;
    if (mesesDesdeInicio < 0 || foraDoFim) return 'competencia_referencia fora da vigência';
    if (pai.periodicidade === 'anual' && mesesDesdeInicio % 12 !== 0) {
      return 'para periodicidade anual, competencia_referencia deve usar o mês de início da vigência';
    }
    return null;
  }

  router.get('/', autenticar, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pessoaId = (req as any).usuario.id;
      const pai = await buscarPai((req.params as any).id);
      if (!pai || !(await autorizarLeitura(pessoaId, pai))) {
        return res.status(404).json({ erro: `${nomePai} não encontrada` });
      }

      const { rows } = await pool.query(
        `SELECT * FROM ${tabelaExcecao} WHERE ${fkPai} = $1 ORDER BY id`,
        [pai.id]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', autenticar, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pessoaId = (req as any).usuario.id;
      const pai = await buscarPai((req.params as any).id);
      if (!pai || !(await autorizarLeitura(pessoaId, pai))) {
        return res.status(404).json({ erro: `${nomePai} não encontrada` });
      }
      if (!(await autorizarEscrita(pessoaId, pai))) {
        return res.status(403).json({ erro: 'Você não tem permissão para registrar exceções neste contrato' });
      }

      const { competencia_referencia, valor_ocorrido, motivo } = req.body;
      const erroCompetencia = validarCompetenciaDoPai(pai, competencia_referencia);
      if (erroCompetencia) return res.status(400).json({ erro: erroCompetencia });

      if (valor_ocorrido !== undefined && valor_ocorrido !== null && !ehNumeroValido(valor_ocorrido)) {
        return res.status(400).json({ erro: 'valor_ocorrido deve ser um número' });
      }
      if (motivo !== undefined && motivo !== null && (typeof motivo !== 'string' || motivo.length > 255)) {
        return res.status(400).json({ erro: 'motivo deve ser um texto de até 255 caracteres' });
      }

      // valor_esperado_original é snapshot do valor do pai neste momento —
      // nunca vem do cliente
      const { rows } = await pool.query(
        `INSERT INTO ${tabelaExcecao} (${fkPai}, competencia_referencia, valor_ocorrido, valor_esperado_original, motivo, lancado_por_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [pai.id, competencia_referencia, valor_ocorrido ?? null, pai.valor_esperado_pai, motivo ?? null, pessoaId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if ((err as any).code === '23505') {
        return res.status(409).json({ erro: 'Já existe uma exceção para essa competência' });
      }
      next(err);
    }
  });

  router.delete('/:excecaoId', autenticar, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pessoaId = (req as any).usuario.id;
      const pai = await buscarPai((req.params as any).id);
      if (!pai || !(await autorizarLeitura(pessoaId, pai))) {
        return res.status(404).json({ erro: `${nomePai} não encontrada` });
      }
      if (!(await autorizarEscrita(pessoaId, pai))) {
        return res.status(403).json({ erro: 'Você não tem permissão para remover exceções deste contrato' });
      }

      const { rowCount } = await pool.query(
        `DELETE FROM ${tabelaExcecao} WHERE id = $1 AND ${fkPai} = $2`,
        [req.params.excecaoId, pai.id]
      );
      if (rowCount === 0) return res.status(404).json({ erro: 'Exceção não encontrada' });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
