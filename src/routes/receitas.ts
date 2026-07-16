import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { dataParaCompetencia, ehCompetenciaValida, mesesEntre } from '../utils/competencia';
import { ehNumeroValido } from '../utils/numero';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

// Valida o vínculo receita → receita fixa e resolve a competencia_referencia
// efetiva (default: a competência da própria receita, quando presente).
async function validarVinculoReceitaFixa(
  receitaFixaId: unknown,
  competenciaReferencia: unknown,
  casaId: unknown,
  pessoaReceitaId: unknown,
  competenciaReceita: unknown
): Promise<{ erro: string } | { erro: null; receitaFixaId: number | null; competenciaReferencia: string | null; contaDestinoPadrao: number | null }> {
  if (receitaFixaId === undefined || receitaFixaId === null) {
    if (competenciaReferencia !== undefined && competenciaReferencia !== null) {
      return { erro: 'competencia_referencia exige receita_fixa_id' };
    }
    return { erro: null, receitaFixaId: null, competenciaReferencia: null, contaDestinoPadrao: null };
  }

  const { rows } = await pool.query(
    `SELECT id, casa_id, pessoa_id, periodicidade, conta_destino_id,
            vigente_desde::text AS vigente_desde, vigente_ate::text AS vigente_ate
     FROM receitas_fixas WHERE id = $1`,
    [receitaFixaId]
  );
  if (rows.length === 0) return { erro: 'Receita fixa não encontrada' };
  const receitaFixa = rows[0];

  if (receitaFixa.casa_id !== null) {
    if (receitaFixa.casa_id !== Number(casaId)) {
      return { erro: 'receita fixa não pertence ao escopo desta receita (casa diferente)' };
    }
  } else {
    if (pessoaReceitaId === undefined || pessoaReceitaId === null) {
      return { erro: 'para vincular a uma receita fixa pessoal, informe pessoa_id na receita' };
    }
    if (receitaFixa.pessoa_id !== Number(pessoaReceitaId)) {
      return { erro: 'receita fixa não pertence ao escopo desta receita (pessoa diferente)' };
    }
  }

  const referencia = competenciaReferencia ?? competenciaReceita;
  if (referencia === undefined || referencia === null) {
    return { erro: 'informe competencia_referencia (ou competencia na receita) para vincular à receita fixa' };
  }
  if (!ehCompetenciaValida(referencia)) {
    return { erro: `competencia_referencia inválida: ${referencia}` };
  }

  const competenciaInicio = dataParaCompetencia(receitaFixa.vigente_desde);
  const mesesDesdeInicio = mesesEntre(competenciaInicio, referencia);
  const foraDoFim = receitaFixa.vigente_ate !== null && mesesEntre(referencia, dataParaCompetencia(receitaFixa.vigente_ate)) < 0;
  if (mesesDesdeInicio < 0 || foraDoFim) {
    return { erro: 'competencia_referencia fora da vigência da receita fixa' };
  }

  if (receitaFixa.periodicidade === 'anual' && mesesDesdeInicio % 12 !== 0) {
    return { erro: 'para receita fixa anual, competencia_referencia deve usar o mês de início da vigência' };
  }

  return { erro: null, receitaFixaId: receitaFixa.id, competenciaReferencia: referencia, contaDestinoPadrao: receitaFixa.conta_destino_id };
}

// Conta em que a receita entra: campo OMITIDO (undefined) herda o default do
// contrato vinculado; null explícito = sem conta (não sobrescrever intenção).
async function resolverContaDestino(
  contaDestinoId: unknown,
  contaDestinoPadrao: number | null
): Promise<{ erro: string } | { erro: null; contaDestinoId: number | null }> {
  const efetiva = contaDestinoId === undefined ? contaDestinoPadrao : (contaDestinoId as number | null);
  if (efetiva === null || efetiva === undefined) return { erro: null, contaDestinoId: null };

  const { rows } = await pool.query('SELECT tipo FROM cartoes_contas WHERE id = $1', [efetiva]);
  if (rows.length === 0) return { erro: 'conta_destino_id inválido' };
  if (rows[0].tipo === 'credito') return { erro: 'conta_destino_id deve ser uma conta (débito/aplicação), não um cartão de crédito' };
  return { erro: null, contaDestinoId: efetiva };
}

function validarValoresReceita(valor_liquido: unknown, valor_bruto: unknown, descontos: unknown): string | null {
  if (!ehNumeroValido(valor_liquido)) return 'valor_liquido deve ser um número';
  if (valor_bruto !== undefined && valor_bruto !== null && !ehNumeroValido(valor_bruto)) return 'valor_bruto deve ser um número';
  if (descontos !== undefined && descontos !== null && !ehNumeroValido(descontos)) return 'descontos deve ser um número';
  return null;
}

const FROM_BASE = `
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
    const { competencia, receita_fixa_id } = req.query;
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

    if (receita_fixa_id !== undefined) {
      params.push(receita_fixa_id);
      query += ` AND r.receita_fixa_id = $${params.length}`;
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
      `SELECT r.*, p.nome AS pessoa_nome, o.nome AS origem_nome, ${podeEditarExpr(2)}
       ${FROM_BASE}
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
    const { casa_id, pessoa_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia, receita_fixa_id, competencia_referencia, conta_destino_id } = req.body;
    const pessoaId = (req as any).usuario.id;

    if (!casa_id || valor_liquido === undefined) {
      return res.status(400).json({ erro: 'casa_id e valor_liquido são obrigatórios' });
    }

    const erroValores = validarValoresReceita(valor_liquido, valor_bruto, descontos);
    if (erroValores) return res.status(400).json({ erro: erroValores });

    // competencia é opcional, mas se vier precisa estar no formato canônico
    if (competencia !== undefined && competencia !== null && !ehCompetenciaValida(competencia)) {
      return res.status(400).json({ erro: `competencia inválida: ${competencia}` });
    }

    const vinculo = await validarVinculoReceitaFixa(receita_fixa_id, competencia_referencia, casa_id, pessoa_id, competencia);
    if (vinculo.erro !== null) return res.status(400).json({ erro: vinculo.erro });

    const contaDestino = await resolverContaDestino(conta_destino_id, vinculo.contaDestinoPadrao);
    if (contaDestino.erro !== null) return res.status(400).json({ erro: contaDestino.erro });

    const { rows: membroRows } = await pool.query(
      'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
      [casa_id, pessoaId]
    );
    if (membroRows.length === 0) return res.status(403).json({ erro: 'Você não é membro desta casa' });

    // lancado_por_id é sempre o usuário autenticado, nunca o valor enviado pelo cliente
    const { rows } = await pool.query(
      `INSERT INTO receitas
         (casa_id, pessoa_id, lancado_por_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia, receita_fixa_id, competencia_referencia, conta_destino_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [casa_id, orNull(pessoa_id), pessoaId, orNull(origem_id), orNull(observacao), orNull(valor_bruto), orNull(descontos), valor_liquido, orNull(data), orNull(competencia), vinculo.receitaFixaId, vinculo.competenciaReferencia, contaDestino.contaDestinoId]
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

    const { casa_id, pessoa_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia, receita_fixa_id, competencia_referencia, conta_destino_id } = req.body;

    if (!casa_id || valor_liquido === undefined) {
      return res.status(400).json({ erro: 'casa_id e valor_liquido são obrigatórios' });
    }

    const erroValores = validarValoresReceita(valor_liquido, valor_bruto, descontos);
    if (erroValores) return res.status(400).json({ erro: erroValores });

    // competencia é opcional, mas se vier precisa estar no formato canônico
    if (competencia !== undefined && competencia !== null && !ehCompetenciaValida(competencia)) {
      return res.status(400).json({ erro: `competencia inválida: ${competencia}` });
    }

    const vinculo = await validarVinculoReceitaFixa(receita_fixa_id, competencia_referencia, casa_id, pessoa_id, competencia);
    if (vinculo.erro !== null) return res.status(400).json({ erro: vinculo.erro });

    const contaDestino = await resolverContaDestino(conta_destino_id, vinculo.contaDestinoPadrao);
    if (contaDestino.erro !== null) return res.status(400).json({ erro: contaDestino.erro });

    // lancado_por_id não é alterável — permanece com quem registrou originalmente
    const { rows } = await pool.query(
      `UPDATE receitas
       SET casa_id = $1, pessoa_id = $2, origem_id = $3, observacao = $4,
           valor_bruto = $5, descontos = $6, valor_liquido = $7, data = $8, competencia = $9,
           receita_fixa_id = $10, competencia_referencia = $11, conta_destino_id = $12
       WHERE id = $13 RETURNING *`,
      [casa_id, orNull(pessoa_id), orNull(origem_id), orNull(observacao), orNull(valor_bruto), orNull(descontos), valor_liquido, orNull(data), orNull(competencia), vinculo.receitaFixaId, vinculo.competenciaReferencia, contaDestino.contaDestinoId, req.params.id]
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
