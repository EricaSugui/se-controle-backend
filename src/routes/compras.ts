import { Router } from 'express';
import { PoolClient } from 'pg';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import {
  adicionarMesesCompetencia, adicionarMesesData, dataParaCompetencia, ehCompetenciaValida, mesesEntre,
} from '../utils/competencia';
import { calcularDatasFatura, calcularMesReferenciaFatura } from '../utils/fatura';
import { ehNumeroValido } from '../utils/numero';

const router = Router();
function orNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

class ErroValidacaoCompra extends Error {}

function podeEditarExpr(paramIndex: number): string {
  return `(c.lancado_por_id = $${paramIndex} OR EXISTS (
    SELECT 1 FROM casa_pessoas WHERE casa_id = c.casa_id AND pessoa_id = $${paramIndex} AND papel = 'admin'
  )) AS pode_editar`;
}

// Cria as N parcelas de uma compra, atribuindo fatura (lazy, find-or-create) quando o
// cartão é de crédito, ou data_propria quando não há cartão de crédito envolvido.
async function criarParcelas(
  client: PoolClient,
  compraId: number,
  data: string,
  cartaoContaId: number | null,
  totalParcelas: number,
  valorParcela: number
): Promise<any[]> {
  let cartao: { tipo: string; dia_fechamento: number | null; dia_vencimento: number | null } | null = null;

  if (cartaoContaId !== null) {
    const { rows } = await client.query(
      'SELECT tipo, dia_fechamento, dia_vencimento FROM cartoes_contas WHERE id = $1',
      [cartaoContaId]
    );
    if (rows.length === 0) throw new ErroValidacaoCompra('Cartão/conta não encontrado');
    cartao = rows[0];
    if (cartao!.tipo === 'credito' && (cartao!.dia_fechamento === null || cartao!.dia_vencimento === null)) {
      throw new ErroValidacaoCompra('Cartão de crédito sem dia_fechamento/dia_vencimento configurado');
    }
  }

  const usaFatura = cartao !== null && cartao.tipo === 'credito';
  const parcelas: any[] = [];
  let mesReferenciaAtual: string | null = null;

  for (let i = 1; i <= totalParcelas; i++) {
    if (usaFatura) {
      const diaFechamento = cartao!.dia_fechamento as number;
      const diaVencimento = cartao!.dia_vencimento as number;

      const mesReferencia: string = i === 1
        ? calcularMesReferenciaFatura(data, diaFechamento, diaVencimento)
        : adicionarMesesCompetencia(mesReferenciaAtual as string, 1);
      mesReferenciaAtual = mesReferencia;

      let datasFatura;
      try {
        datasFatura = calcularDatasFatura(mesReferencia, diaFechamento, diaVencimento);
      } catch (e) {
        throw new ErroValidacaoCompra((e as Error).message);
      }

      const insertFatura = await client.query(
        `INSERT INTO faturas (cartao_conta_id, mes_referencia, data_fechamento, data_vencimento)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cartao_conta_id, mes_referencia) DO NOTHING
         RETURNING id`,
        [cartaoContaId, mesReferencia, datasFatura.data_fechamento, datasFatura.data_vencimento]
      );

      let faturaId: number;
      if (insertFatura.rows.length > 0) {
        faturaId = insertFatura.rows[0].id;
      } else {
        const { rows } = await client.query(
          'SELECT id FROM faturas WHERE cartao_conta_id = $1 AND mes_referencia = $2',
          [cartaoContaId, mesReferencia]
        );
        faturaId = rows[0].id;
      }

      const { rows: parcelaRows } = await client.query(
        `INSERT INTO parcelas (compra_id, numero_parcela, valor, fatura_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [compraId, i, valorParcela, faturaId]
      );
      parcelas.push(parcelaRows[0]);
    } else {
      const dataPropria = adicionarMesesData(data, i - 1);
      const { rows: parcelaRows } = await client.query(
        `INSERT INTO parcelas (compra_id, numero_parcela, valor, data_propria) VALUES ($1, $2, $3, $4) RETURNING *`,
        [compraId, i, valorParcela, dataPropria]
      );
      parcelas.push(parcelaRows[0]);
    }
  }

  return parcelas;
}

// Valida o vínculo compra → despesa fixa e resolve a competencia_referencia
// efetiva (default: a competência da própria compra).
async function validarVinculoDespesaFixa(
  despesaFixaId: unknown,
  competenciaReferencia: unknown,
  casaId: unknown,
  pessoaCompraId: unknown,
  competenciaCompra: string
): Promise<{ despesaFixaId: number | null; competenciaReferencia: string | null }> {
  if (despesaFixaId === undefined || despesaFixaId === null) {
    if (competenciaReferencia !== undefined && competenciaReferencia !== null) {
      throw new ErroValidacaoCompra('competencia_referencia exige despesa_fixa_id');
    }
    return { despesaFixaId: null, competenciaReferencia: null };
  }

  const { rows } = await pool.query(
    `SELECT id, casa_id, pessoa_id, periodicidade,
            vigente_desde::text AS vigente_desde, vigente_ate::text AS vigente_ate
     FROM despesas_fixas WHERE id = $1`,
    [despesaFixaId]
  );
  if (rows.length === 0) throw new ErroValidacaoCompra('Despesa fixa não encontrada');
  const despesa = rows[0];

  const escopoCompativel = despesa.casa_id !== null
    ? despesa.casa_id === Number(casaId)
    : despesa.pessoa_id === Number(pessoaCompraId);
  if (!escopoCompativel) {
    throw new ErroValidacaoCompra('despesa fixa não pertence ao escopo desta compra (casa ou pessoa diferente)');
  }

  const referencia = (competenciaReferencia ?? competenciaCompra) as string;
  if (!ehCompetenciaValida(referencia)) {
    throw new ErroValidacaoCompra(`competencia_referencia inválida: ${referencia}`);
  }

  const competenciaInicio = dataParaCompetencia(despesa.vigente_desde);
  const mesesDesdeInicio = mesesEntre(competenciaInicio, referencia);
  const foraDoFim = despesa.vigente_ate !== null && mesesEntre(referencia, dataParaCompetencia(despesa.vigente_ate)) < 0;
  if (mesesDesdeInicio < 0 || foraDoFim) {
    throw new ErroValidacaoCompra('competencia_referencia fora da vigência da despesa fixa');
  }

  if (despesa.periodicidade === 'anual' && mesesDesdeInicio % 12 !== 0) {
    throw new ErroValidacaoCompra('para despesa fixa anual, competencia_referencia deve usar o mês de início da vigência');
  }

  return { despesaFixaId: despesa.id, competenciaReferencia: referencia };
}

const FROM_BASE = `
  FROM compras c
  LEFT JOIN pessoas p ON p.id = c.pessoa_id
  LEFT JOIN categorias cat ON cat.id = c.categoria_id
  LEFT JOIN cartoes_contas cc ON cc.id = c.cartao_conta_id
`;

// A tabela compras não armazena valor_parcela (vive nas parcelas, todas com o
// mesmo valor) — o contrato expõe o campo em Compra, então derivamos aqui.
const VALOR_PARCELA_EXPR = `
  (SELECT p2.valor FROM parcelas p2 WHERE p2.compra_id = c.id ORDER BY p2.numero_parcela LIMIT 1) AS valor_parcela
`;

router.get('/', autenticar, async (req, res, next) => {
  try {
    const { competencia, de, ate, despesa_fixa_id } = req.query;
    const pessoaId = (req as any).usuario.id;
    const params: unknown[] = [pessoaId];
    let query = `
      SELECT c.*, p.nome AS pessoa_nome, cat.nome AS categoria_nome, cc.nome AS cartao_conta_nome,
             ${VALOR_PARCELA_EXPR}, ${podeEditarExpr(1)}
      ${FROM_BASE}
      WHERE c.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1)
    `;

    if (despesa_fixa_id !== undefined) {
      params.push(despesa_fixa_id);
      query += ` AND c.despesa_fixa_id = $${params.length}`;
    }

    if (competencia !== undefined) {
      params.push(competencia);
      query += ` AND c.competencia = $${params.length}`;
    }

    if (de !== undefined) {
      params.push(de);
      query += ` AND c.id IN (SELECT compra_id FROM parcelas_com_caixa WHERE data_caixa >= $${params.length})`;
    }

    if (ate !== undefined) {
      params.push(ate);
      query += ` AND c.id IN (SELECT compra_id FROM parcelas_com_caixa WHERE data_caixa <= $${params.length})`;
    }

    query += ' ORDER BY c.data DESC';
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
      `SELECT c.*, p.nome AS pessoa_nome, cat.nome AS categoria_nome, cc.nome AS cartao_conta_nome,
              ${VALOR_PARCELA_EXPR}, ${podeEditarExpr(2)}
       ${FROM_BASE}
       WHERE c.id = $1
         AND c.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $2)`,
      [req.params.id, pessoaId]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Compra não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/parcelas', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(
      `SELECT pcc.* FROM parcelas_com_caixa pcc
       WHERE pcc.compra_id = $1
         AND pcc.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $2)
       ORDER BY pcc.numero_parcela`,
      [req.params.id, pessoaId]
    );

    if (rows.length === 0) {
      const { rows: compraRows } = await pool.query(
        `SELECT 1 FROM compras WHERE id = $1 AND casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $2)`,
        [req.params.id, pessoaId]
      );
      if (compraRows.length === 0) return res.status(404).json({ erro: 'Compra não encontrada' });
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const {
      casa_id, pessoa_id, categoria_id, descricao, cartao_conta_id,
      forma_pagamento_id, data, competencia, total_parcelas, valor_parcela,
      despesa_fixa_id, competencia_referencia,
    } = req.body;
    const pessoaId = (req as any).usuario.id;

    if (!casa_id || !pessoa_id || !categoria_id || !data || !competencia || valor_parcela === undefined) {
      return res.status(400).json({
        erro: 'casa_id, pessoa_id, categoria_id, data, competencia e valor_parcela são obrigatórios',
      });
    }

    if (!ehNumeroValido(valor_parcela)) {
      return res.status(400).json({ erro: 'valor_parcela deve ser um número' });
    }

    if (!ehCompetenciaValida(competencia)) {
      return res.status(400).json({ erro: `competencia inválida: ${competencia}` });
    }

    const totalParcelas = total_parcelas || 1;

    const { rows: membroRows } = await pool.query(
      'SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2',
      [casa_id, pessoaId]
    );
    if (membroRows.length === 0) return res.status(403).json({ erro: 'Você não é membro desta casa' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const vinculo = await validarVinculoDespesaFixa(despesa_fixa_id, competencia_referencia, casa_id, pessoa_id, competencia);

      // lancado_por_id é sempre o usuário autenticado, nunca o valor enviado pelo cliente
      const { rows: compraRows } = await client.query(
        `INSERT INTO compras
           (casa_id, pessoa_id, lancado_por_id, categoria_id, descricao, cartao_conta_id, forma_pagamento_id, data, competencia, total_parcelas,
            despesa_fixa_id, competencia_referencia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          casa_id, pessoa_id, pessoaId, categoria_id, orNull(descricao),
          orNull(cartao_conta_id), orNull(forma_pagamento_id), data, competencia, totalParcelas,
          vinculo.despesaFixaId, vinculo.competenciaReferencia,
        ]
      );
      const compra = compraRows[0];

      const parcelas = await criarParcelas(client, compra.id, data, orNull(cartao_conta_id), totalParcelas, valor_parcela);

      await client.query('COMMIT');
      res.status(201).json({ ...compra, valor_parcela, parcelas });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof ErroValidacaoCompra) {
        return res.status(400).json({ erro: err.message });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Confere se `pessoaId` registrou a compra ou é admin na casa dela.
async function autorizarGerenciamento(
  pessoaId: number,
  compraId: string
): Promise<'ok' | 'nao_encontrado' | 'sem_permissao'> {
  const { rows } = await pool.query('SELECT casa_id, lancado_por_id FROM compras WHERE id = $1', [compraId]);
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
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Compra não encontrada' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para editar esta compra' });

    const {
      casa_id, pessoa_id, categoria_id, descricao, cartao_conta_id,
      forma_pagamento_id, data, competencia, total_parcelas, valor_parcela,
      despesa_fixa_id, competencia_referencia,
    } = req.body;

    if (!casa_id || !pessoa_id || !categoria_id || !data || !competencia || valor_parcela === undefined) {
      return res.status(400).json({
        erro: 'casa_id, pessoa_id, categoria_id, data, competencia e valor_parcela são obrigatórios',
      });
    }

    if (!ehNumeroValido(valor_parcela)) {
      return res.status(400).json({ erro: 'valor_parcela deve ser um número' });
    }

    if (!ehCompetenciaValida(competencia)) {
      return res.status(400).json({ erro: `competencia inválida: ${competencia}` });
    }

    const totalParcelas = total_parcelas || 1;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const vinculo = await validarVinculoDespesaFixa(despesa_fixa_id, competencia_referencia, casa_id, pessoa_id, competencia);

      // lancado_por_id não é alterável — permanece com quem registrou originalmente
      const { rows: compraRows } = await client.query(
        `UPDATE compras
         SET casa_id = $1, pessoa_id = $2, categoria_id = $3, descricao = $4, cartao_conta_id = $5,
             forma_pagamento_id = $6, data = $7, competencia = $8, total_parcelas = $9,
             despesa_fixa_id = $10, competencia_referencia = $11
         WHERE id = $12 RETURNING *`,
        [
          casa_id, pessoa_id, categoria_id, orNull(descricao), orNull(cartao_conta_id),
          orNull(forma_pagamento_id), data, competencia, totalParcelas,
          vinculo.despesaFixaId, vinculo.competenciaReferencia, req.params.id,
        ]
      );
      const compra = compraRows[0];

      await client.query('DELETE FROM parcelas WHERE compra_id = $1', [compra.id]);
      const parcelas = await criarParcelas(client, compra.id, data, orNull(cartao_conta_id), totalParcelas, valor_parcela);

      await client.query('COMMIT');
      res.json({ ...compra, valor_parcela, parcelas });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof ErroValidacaoCompra) {
        return res.status(400).json({ erro: err.message });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const autorizacao = await autorizarGerenciamento(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Compra não encontrada' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para excluir esta compra' });

    await pool.query('DELETE FROM compras WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
