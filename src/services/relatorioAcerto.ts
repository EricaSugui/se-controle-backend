import { PoolClient } from 'pg';
import PDFDocument from 'pdfkit';
import pool from '../db';
import { calcularAcerto, AcertoContas } from './acertoContas';

export type ParticipanteTotal = {
  pessoa_id?: number;
  nome?: string;
  desembolsado: number;
};

type ExportacaoRelatorio = {
  nome_casa: string;
  moeda: string;
  confirmado_em: Date | string;
  participantes: Array<{
    nome: string;
    devido: number;
    desembolsado: number;
    saldo: number;
  }>;
  despesas: Array<{
    descricao: string;
    valor: number;
    nome_pessoa: string;
  }>;
  transferencias: Array<{
    de_nome?: string;
    para_nome?: string;
    valor: number;
  }>;
};

export type RateioEstornoInput = {
  id: number;
  nome: string;
  percentual: number;
};

export type AjusteEstorno = {
  casa_id: number;
  origem_tipo: 'compra';
  origem_id: number;
  tipo: 'estorno';
  de_pessoa_id: number;
  de_nome_snapshot: string;
  para_pessoa_id: number;
  para_nome_snapshot: string;
  valor: number;
  moeda: string;
  data: string;
  descricao: string;
};

function slugificar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function criarNomeArquivoBase(nomeCasa: string, nomesParticipantes: string[], data: Date): string {
  const identificador = slugificar(nomeCasa) ||
    slugificar(nomesParticipantes.filter(Boolean).join('-')) ||
    'sem-participantes';
  const prefixo = nomeCasa.trim() ? 'acerto' : 'casa';
  const sufixo = `-${dataISO(data)}`;
  const maxPrefixo = 180 - sufixo.length;
  return `${prefixo}-${identificador}`.slice(0, maxPrefixo) + sufixo;
}

export function calcularTotalRelatorio(participantes: ParticipanteTotal[]): number {
  const centavos = participantes.reduce(
    (total, participante) => total + Math.round(participante.desembolsado * 100),
    0
  );
  return centavos / 100;
}

export function gerarAjustesEstorno(input: {
  origemId: number;
  casaId: number;
  valor: number;
  desembolsadoPor: { id: number; nome: string };
  rateios: RateioEstornoInput[];
  data: string;
}): AjusteEstorno[] {
  const totalCentavos = Math.round(input.valor * 100);
  const deltas = new Map<number, { nome: string; cents: number }>();
  const adicionar = (id: number, nome: string, cents: number) => {
    const atual = deltas.get(id) ?? { nome, cents: 0 };
    atual.cents += cents;
    deltas.set(id, atual);
  };
  const rateioCentavos = input.rateios.map((rateio) => ({
    ...rateio,
    cents: Math.round(totalCentavos * rateio.percentual / 100),
  }));
  const diferenca = totalCentavos - rateioCentavos.reduce((sum, rateio) => sum + rateio.cents, 0);
  if (rateioCentavos.length > 0) rateioCentavos[0].cents += diferenca;
  adicionar(input.desembolsadoPor.id, input.desembolsadoPor.nome, -totalCentavos);
  for (const rateio of rateioCentavos) adicionar(rateio.id, rateio.nome, rateio.cents);

  const devedores = [...deltas.entries()].filter(([, delta]) => delta.cents < 0);
  const credores = [...deltas.entries()].filter(([, delta]) => delta.cents > 0);
  const ajustes: AjusteEstorno[] = [];
  let devedorIndex = 0;
  let credorIndex = 0;
  while (devedorIndex < devedores.length && credorIndex < credores.length) {
    const [devedorId, devedor] = devedores[devedorIndex];
    const [credorId, credor] = credores[credorIndex];
    const cents = Math.min(-devedor.cents, credor.cents);
    if (devedorId !== credorId && cents > 0) {
      ajustes.push({
        casa_id: input.casaId,
        origem_tipo: 'compra',
        origem_id: input.origemId,
        tipo: 'estorno',
        de_pessoa_id: devedorId,
        de_nome_snapshot: devedor.nome,
        para_pessoa_id: credorId,
        para_nome_snapshot: credor.nome,
        valor: cents / 100,
        moeda: 'BRL',
        data: input.data,
        descricao: 'Estorno de compra cancelada',
      });
    }
    devedor.cents += cents;
    credor.cents -= cents;
    if (devedor.cents === 0) devedorIndex++;
    if (credor.cents === 0) credorIndex++;
  }
  return ajustes;
}

function csvCampo(valor: unknown): string {
  const texto = String(valor ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
}

export function gerarCsvRelatorio(relatorio: ExportacaoRelatorio): string {
  const linhas = [
    ['tipo', 'casa', 'data', 'mes', 'pessoa', 'descricao', 'origem', 'destino', 'moeda', 'valor', 'status'],
    ['resumo', relatorio.nome_casa, new Date(relatorio.confirmado_em).toISOString(), '', '', '', '', '', relatorio.moeda, '', 'confirmado'],
    ...relatorio.participantes.map((participante) => [
      'participante', relatorio.nome_casa, '', '', participante.nome, '', '', '', relatorio.moeda,
      participante.saldo.toFixed(2), 'confirmado',
    ]),
    ...relatorio.despesas.map((despesa) => [
      'despesa', relatorio.nome_casa, '', '', despesa.nome_pessoa, despesa.descricao, '', '', relatorio.moeda,
      despesa.valor.toFixed(2), 'confirmado',
    ]),
    ...relatorio.transferencias.map((transferencia) => [
      'transferencia', relatorio.nome_casa, '', '', '', '', transferencia.de_nome ?? '',
      transferencia.para_nome ?? '', relatorio.moeda, transferencia.valor.toFixed(2), 'confirmado',
    ]),
  ];
  return `${linhas.map((linha) => linha.map(csvCampo).join(',')).join('\r\n')}\r\n`;
}

export function gerarPdfRelatorio(relatorio: ExportacaoRelatorio): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const documento = new PDFDocument({ margin: 48 });
    const partes: Buffer[] = [];
    documento.on('data', (parte: Buffer) => partes.push(parte));
    documento.on('end', () => resolve(Buffer.concat(partes)));
    documento.on('error', reject);

    documento.fontSize(20).text('Relatório de acerto de contas');
    documento.moveDown(0.5).fontSize(13).text(relatorio.nome_casa);
    documento.fontSize(10).text(`Confirmado em: ${new Date(relatorio.confirmado_em).toISOString()}`);
    documento.text(`Moeda: ${relatorio.moeda}`);
    documento.moveDown();

    documento.fontSize(14).text('Participantes');
    documento.fontSize(10);
    for (const participante of relatorio.participantes) {
      documento.text(
        `${participante.nome}: devido ${participante.devido.toFixed(2)} | ` +
        `desembolsado ${participante.desembolsado.toFixed(2)} | saldo ${participante.saldo.toFixed(2)}`
      );
    }

    documento.moveDown().fontSize(14).text('Despesas');
    documento.fontSize(10);
    for (const despesa of relatorio.despesas) {
      documento.text(`${despesa.descricao} — ${despesa.nome_pessoa} — ${despesa.valor.toFixed(2)}`);
    }

    documento.moveDown().fontSize(14).text('Transferências');
    documento.fontSize(10);
    for (const transferencia of relatorio.transferencias) {
      documento.text(
        `${transferencia.de_nome ?? ''} → ${transferencia.para_nome ?? ''} — ${transferencia.valor.toFixed(2)}`
      );
    }
    documento.end();
  });
}

export type AcertoRelatorioResumo = {
  id: number;
  casa_id: number;
  confirmado_em: Date;
  moeda: string;
  precisao_moeda: number;
  nome_casa: string;
  total: number;
  nome_arquivo_base: string;
};

export type AcertoRelatorio = AcertoRelatorioResumo & {
  participantes: Array<{
    pessoa_id: number;
    nome: string;
    devido: number;
    desembolsado: number;
    pagamentos_enviados: number;
    pagamentos_recebidos: number;
    saldo: number;
  }>;
  meses: Array<{
    mes: string;
    pessoa_id: number;
    nome: string;
    devido: number;
    desembolsado: number;
    acerto: number;
  }>;
  despesas: Array<{
    descricao: string;
    data: string;
    competencia: string;
    valor: number;
    pessoa_id: number;
    nome_pessoa: string;
    categoria_nome: string | null;
    modo_acerto: 'competencia' | 'caixa';
  }>;
  transferencias: Array<{
    de_pessoa_id: number;
    de_nome: string;
    para_pessoa_id: number;
    para_nome: string;
    valor: number;
    data: string;
    observacao: string | null;
    tipo: 'pagamento' | 'estorno';
  }>;
  eventos: Array<{
    tipo: string;
    pessoa_id: number;
    created_at: Date;
    metadados: Record<string, unknown> | null;
  }>;
};

function nomeArquivoParaData(nomeCasa: string, nomes: string[], data: Date): string {
  return criarNomeArquivoBase(nomeCasa, nomes, data);
}

async function inserirSnapshot(
  client: PoolClient,
  casaId: number,
  pessoaId: number,
  idempotencyKey: string,
  acerto: AcertoContas,
  casa: { nome: string },
  confirmadoEm: Date
): Promise<number> {
  const nomes = acerto.saldos.map((saldo) => saldo.nome);
  const nomeArquivoBase = nomeArquivoParaData(casa.nome, nomes, confirmadoEm);
  const { rows } = await client.query(
    `INSERT INTO acertos
       (casa_id, confirmado_por_id, confirmado_em, moeda, precisao_moeda,
        nome_casa_snapshot, nome_arquivo_base, idempotency_key)
     VALUES ($1, $2, $3, 'BRL', 2, $4, $5, $6)
     RETURNING id`,
    [casaId, pessoaId, confirmadoEm, casa.nome, nomeArquivoBase, idempotencyKey]
  );
  const acertoId = rows[0].id as number;

  for (const saldo of acerto.saldos) {
    await client.query(
      `INSERT INTO acerto_participantes
        (acerto_id, pessoa_id, nome_snapshot, devido, desembolsado,
         pagamentos_enviados, pagamentos_recebidos, saldo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [acertoId, saldo.pessoa_id, saldo.nome, saldo.devido, saldo.desembolsado,
        saldo.pagamentos_enviados, saldo.pagamentos_recebidos, saldo.saldo]
    );
  }

  for (const mes of acerto.meses) {
    for (const pessoa of mes.por_pessoa) {
      await client.query(
        `INSERT INTO acerto_meses
          (acerto_id, mes, pessoa_id, nome_snapshot, devido, desembolsado, acerto)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [acertoId, mes.mes, pessoa.pessoa_id, pessoa.nome, pessoa.devido, pessoa.desembolsado, pessoa.acerto]
      );
    }
  }

  const { rows: despesas } = await client.query(
    `SELECT c.id AS origem_id,
            COALESCE(NULLIF(c.descricao, ''), 'Compra sem descrição') AS descricao,
            c.data::text AS data, c.competencia,
            COALESCE(SUM(p.valor), 0) AS valor, c.pessoa_id,
            pessoa.nome AS nome_pessoa, categoria.nome AS categoria_nome,
            COALESCE(c.acerto_eixo, casa.acerto_eixo) AS modo_acerto
     FROM compras c
     JOIN casas casa ON casa.id = c.casa_id
     JOIN pessoas pessoa ON pessoa.id = c.pessoa_id
     LEFT JOIN categorias categoria ON categoria.id = c.categoria_id
     LEFT JOIN parcelas p ON p.compra_id = c.id
     WHERE c.casa_id = $1 AND c.status = 'ativa'
     GROUP BY c.id, pessoa.nome, categoria.nome, casa.acerto_eixo
     ORDER BY c.data, c.id`,
    [casaId]
  );
  for (const despesa of despesas) {
    await client.query(
      `INSERT INTO acerto_despesas
        (acerto_id, origem_id, descricao_snapshot, data, competencia, valor,
         pessoa_id, nome_pessoa_snapshot, categoria_nome_snapshot, modo_acerto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [acertoId, despesa.origem_id, despesa.descricao, despesa.data, despesa.competencia,
        despesa.valor, despesa.pessoa_id, despesa.nome_pessoa, despesa.categoria_nome, despesa.modo_acerto]
    );
  }

  for (const pagamento of acerto.pagamentos) {
    await client.query(
      `INSERT INTO acerto_transferencias
        (acerto_id, origem_pagamento_id, de_pessoa_id, de_nome_snapshot,
         para_pessoa_id, para_nome_snapshot, valor, data, observacao, tipo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [acertoId, pagamento.id > 0 ? pagamento.id : null, pagamento.de_pessoa_id, pagamento.de_pessoa_nome,
        pagamento.para_pessoa_id, pagamento.para_pessoa_nome, pagamento.valor,
        pagamento.data, pagamento.observacao, pagamento.tipo ?? 'pagamento']
    );
  }

  await client.query(
    `UPDATE acerto_ajustes
     SET aplicado_em_acerto_id = $1
     WHERE casa_id = $2 AND aplicado_em_acerto_id IS NULL`,
    [acertoId, casaId]
  );

  await client.query(
    `INSERT INTO acerto_eventos (acerto_id, tipo, pessoa_id)
     VALUES ($1, 'confirmado', $2)`,
    [acertoId, pessoaId]
  );
  return acertoId;
}

export async function confirmarAcerto(
  casaId: number,
  pessoaId: number,
  idempotencyKey: string
): Promise<AcertoRelatorio> {
  const { rows: casaRows } = await pool.query('SELECT id, nome FROM casas WHERE id = $1', [casaId]);
  if (casaRows.length === 0) throw Object.assign(new Error('Casa não encontrada'), { status: 404 });

  const existing = await pool.query(
    'SELECT id FROM acertos WHERE casa_id = $1 AND idempotency_key = $2',
    [casaId, idempotencyKey]
  );
  if (existing.rows.length > 0) return obterAcerto(casaId, existing.rows[0].id);

  const acerto = await calcularAcerto(casaId);
  if (acerto === null) throw Object.assign(new Error('Casa não encontrada'), { status: 404 });

  const confirmadoEm = new Date();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SAVEPOINT acerto_insert');
    let acertoId: number;
    try {
      acertoId = await inserirSnapshot(client, casaId, pessoaId, idempotencyKey, acerto, casaRows[0], confirmadoEm);
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error;
      await client.query('ROLLBACK TO SAVEPOINT acerto_insert');
      const duplicate = await client.query(
        'SELECT id FROM acertos WHERE casa_id = $1 AND idempotency_key = $2',
        [casaId, idempotencyKey]
      );
      if (duplicate.rows.length === 0) throw error;
      acertoId = duplicate.rows[0].id;
    }
    await client.query('COMMIT');
    return obterAcerto(casaId, acertoId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelarCompra(
    compraId: number,
    pessoaId: number,
    motivo?: string
  ): Promise<{ estornada: boolean }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT c.id, c.casa_id, c.status, c.data::text AS data, c.competencia,
                COALESCE(SUM(parcela.valor), 0) AS valor,
                cc.titular_id AS desembolsado_por_id,
                titular.nome AS desembolsado_por_nome,
                EXISTS (SELECT 1 FROM acerto_despesas ad WHERE ad.origem_id = c.id) AS participou
         FROM compras c
         LEFT JOIN parcelas parcela ON parcela.compra_id = c.id
         LEFT JOIN cartoes_contas cc ON cc.id = c.cartao_conta_id
         LEFT JOIN pessoas titular ON titular.id = cc.titular_id
         WHERE c.id = $1
         GROUP BY c.id, cc.titular_id, titular.nome`,
        [compraId]
      );
      if (rows.length === 0) throw Object.assign(new Error('Compra não encontrada'), { status: 404 });
      const compra = rows[0];
      if (compra.status === 'cancelada') {
        throw Object.assign(new Error('Compra já está cancelada'), { status: 409 });
      }

      if (!compra.participou) {
        await client.query('DELETE FROM compras WHERE id = $1', [compraId]);
        await client.query('COMMIT');
        return { estornada: false };
      }
      if (!compra.desembolsado_por_id) {
        throw Object.assign(new Error('Não é possível estornar uma compra sem desembolsador'), { status: 409 });
      }

      const { rows: rateiosDiretos } = await client.query(
        `SELECT cp.pessoa_id AS id, p.nome, cp.percentual
         FROM compra_pagadores cp
         JOIN pessoas p ON p.id = cp.pessoa_id
         WHERE cp.compra_id = $1
         ORDER BY cp.id`,
        [compraId]
      );
      const { rows: rateiosCasa } = rateiosDiretos.length === 0
        ? await client.query(
          `SELECT pc.pessoa_id AS id, p.nome, pc.percentual
           FROM percentuais_custeio pc
           JOIN pessoas p ON p.id = pc.pessoa_id
           WHERE pc.casa_id = $1 AND pc.competencia = $2
           ORDER BY pc.id`,
          [compra.casa_id, compra.competencia]
        )
        : { rows: rateiosDiretos };
      if (rateiosCasa.length === 0) {
        throw Object.assign(new Error('Não foi possível reconstruir o rateio original da compra'), { status: 409 });
      }

      const explicitos = rateiosCasa.filter((rateio: { percentual: number | null }) => rateio.percentual !== null);
      const nulos = rateiosCasa.filter((rateio: { percentual: number | null }) => rateio.percentual === null);
      const somaExplicita = explicitos.reduce(
        (total: number, rateio: { percentual: number | null }) => total + Number(rateio.percentual),
        0
      );
      const percentualNulo = nulos.length > 0 ? Math.max(0, 100 - somaExplicita) / nulos.length : 0;
      const rateiosNormalizados = rateiosCasa.map((rateio: { id: number; nome: string; percentual: number | null }) => ({
        id: rateio.id,
        nome: rateio.nome,
        percentual: rateio.percentual === null ? percentualNulo : Number(rateio.percentual),
      }));
      const soma = rateiosNormalizados.reduce((total, rateio) => total + rateio.percentual, 0);
      if (soma <= 0) throw Object.assign(new Error('O rateio original da compra é inválido'), { status: 409 });
      const ajustes = gerarAjustesEstorno({
        origemId: compraId,
        casaId: compra.casa_id,
        valor: Number(compra.valor),
        desembolsadoPor: { id: compra.desembolsado_por_id, nome: compra.desembolsado_por_nome },
        rateios: rateiosNormalizados.map((rateio) => ({
          id: rateio.id,
          nome: rateio.nome,
          percentual: rateio.percentual * 100 / soma,
        })),
        data: compra.data,
      });

      await client.query(
        `UPDATE compras
         SET status = 'cancelada', cancelada_em = now(), cancelada_por_id = $1, cancelamento_motivo = $2
         WHERE id = $3`,
        [pessoaId, motivo?.trim() || null, compraId]
      );
      for (const ajuste of ajustes) {
        await client.query(
          `INSERT INTO acerto_ajustes
            (casa_id, origem_tipo, origem_id, tipo, de_pessoa_id, de_nome_snapshot,
             para_pessoa_id, para_nome_snapshot, valor, moeda, data, descricao)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (origem_tipo, origem_id, de_pessoa_id, para_pessoa_id) DO NOTHING`,
          [ajuste.casa_id, ajuste.origem_tipo, ajuste.origem_id, ajuste.tipo,
            ajuste.de_pessoa_id, ajuste.de_nome_snapshot, ajuste.para_pessoa_id,
            ajuste.para_nome_snapshot, ajuste.valor, ajuste.moeda, ajuste.data, ajuste.descricao]
        );
      }
      await client.query('COMMIT');
      return { estornada: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
}

export async function listarAcertos(casaId: number): Promise<AcertoRelatorioResumo[]> {
  const { rows } = await pool.query(
    `SELECT a.id, a.casa_id, a.confirmado_em, a.moeda, a.precisao_moeda,
            a.nome_casa_snapshot AS nome_casa, a.nome_arquivo_base,
            COALESCE(SUM(ap.desembolsado), 0) AS total
     FROM acertos a
     LEFT JOIN acerto_participantes ap ON ap.acerto_id = a.id
     WHERE a.casa_id = $1
     GROUP BY a.id
     ORDER BY a.confirmado_em DESC, a.id DESC`,
    [casaId]
  );
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

export async function obterAcerto(casaId: number, acertoId: number): Promise<AcertoRelatorio> {
  const { rows: acertoRows } = await pool.query(
    `SELECT a.id, a.casa_id, a.confirmado_em, a.moeda, a.precisao_moeda,
            a.nome_casa_snapshot AS nome_casa, a.nome_arquivo_base,
            COALESCE(SUM(ap.desembolsado), 0) AS total
     FROM acertos a
     LEFT JOIN acerto_participantes ap ON ap.acerto_id = a.id
     WHERE a.id = $1 AND a.casa_id = $2
     GROUP BY a.id`,
    [acertoId, casaId]
  );
  if (acertoRows.length === 0) throw Object.assign(new Error('Acerto não encontrado'), { status: 404 });

  const [participantes, meses, despesas, transferencias, eventos] = await Promise.all([
    pool.query(
      `SELECT pessoa_id, nome_snapshot AS nome, devido, desembolsado,
              pagamentos_enviados, pagamentos_recebidos, saldo
       FROM acerto_participantes WHERE acerto_id = $1 ORDER BY nome_snapshot`,
      [acertoId]
    ),
    pool.query(
      `SELECT mes, pessoa_id, nome_snapshot AS nome, devido, desembolsado, acerto
       FROM acerto_meses WHERE acerto_id = $1 ORDER BY mes DESC, nome_snapshot`,
      [acertoId]
    ),
    pool.query(
      `SELECT descricao_snapshot AS descricao, data::text AS data, competencia,
              valor, pessoa_id, nome_pessoa_snapshot AS nome_pessoa,
              categoria_nome_snapshot AS categoria_nome, modo_acerto
       FROM acerto_despesas WHERE acerto_id = $1 ORDER BY data, id`,
      [acertoId]
    ),
    pool.query(
      `SELECT de_pessoa_id, de_nome_snapshot AS de_nome, para_pessoa_id,
              para_nome_snapshot AS para_nome, valor, data::text AS data, observacao, tipo
       FROM acerto_transferencias WHERE acerto_id = $1 ORDER BY data, id`,
      [acertoId]
    ),
    pool.query(
      `SELECT tipo, pessoa_id, created_at, metadados
       FROM acerto_eventos WHERE acerto_id = $1 ORDER BY created_at, id`,
      [acertoId]
    ),
  ]);
  return {
    ...acertoRows[0],
    total: Number(acertoRows[0].total),
    participantes: participantes.rows.map((row) => ({
      ...row,
      devido: Number(row.devido),
      desembolsado: Number(row.desembolsado),
      pagamentos_enviados: Number(row.pagamentos_enviados),
      pagamentos_recebidos: Number(row.pagamentos_recebidos),
      saldo: Number(row.saldo),
    })),
    meses: meses.rows.map((row) => ({
      ...row,
      devido: Number(row.devido),
      desembolsado: Number(row.desembolsado),
      acerto: Number(row.acerto),
    })),
    despesas: despesas.rows.map((row) => ({ ...row, valor: Number(row.valor) })),
    transferencias: transferencias.rows.map((row) => ({ ...row, valor: Number(row.valor) })),
    eventos: eventos.rows,
  };
}
