import pool from '../db';
import { competenciaParaData, dataParaCompetencia } from '../utils/competencia';

// Acerto de contas (docs/acerto-contas.md): conta corrente entre as pessoas
// da casa. Por compra: DEVIDO segue o rateio (compra_pagadores → senão
// percentuais_custeio da competência da compra) e DESEMBOLSADO é do titular
// do meio de pagamento. Pagamentos/adiantamentos registrados entram direto
// no saldo. O eixo efetivo (compra.acerto_eixo → senão casa.acerto_eixo)
// decide o QUANDO: competência = valor cheio no mês da compra; caixa = pinga
// por parcela na data_caixa.

export type EixoAcerto = 'competencia' | 'caixa';

export interface SaldoPessoa {
  pessoa_id: number;
  nome: string;
  devido: number;
  desembolsado: number;
  pagamentos_enviados: number;
  pagamentos_recebidos: number;
  saldo: number; // positivo = a receber; a soma entre as pessoas fecha em zero
}

export interface AcertoMesPessoa {
  pessoa_id: number;
  nome: string;
  devido: number;
  desembolsado: number;
  acerto: number; // desembolsado - devido no mês
}

export interface AcertoMes {
  mes: string; // competência MMM-AA (no eixo caixa, o mês da data_caixa)
  por_pessoa: AcertoMesPessoa[];
}

export interface PagamentoAcerto {
  id: number;
  de_pessoa_id: number;
  de_pessoa_nome: string;
  para_pessoa_id: number;
  para_pessoa_nome: string;
  valor: number;
  data: string;
  observacao: string | null;
  lancado_por_id: number | null;
}

export interface AvisoAcerto {
  tipo: 'meses_sem_combinado' | 'compras_sem_meio' | 'rateio_nao_soma_100' | 'combinado_nao_soma_100';
  mensagem: string;
  quantidade: number;
}

export interface AcertoContas {
  casa_id: number;
  acerto_eixo: EixoAcerto;
  saldos: SaldoPessoa[];
  meses: AcertoMes[];
  pagamentos: PagamentoAcerto[];
  avisos: AvisoAcerto[];
}

interface Share {
  pessoaId: number;
  percentual: number;
}

// Divide um valor em centavos conforme os percentuais, distribuindo a sobra
// de arredondamento pelo método do maior resto — a soma das partes é sempre
// exatamente o valor rateado.
function ratear(valorCents: number, shares: Share[]): Map<number, number> {
  const brutos = shares.map((s) => (valorCents * s.percentual) / 100);
  const pisos = brutos.map((b) => Math.floor(b));
  let sobra = valorCents - pisos.reduce((soma, p) => soma + p, 0);

  const ordemResto = brutos
    .map((b, i) => ({ i, resto: b - Math.floor(b) }))
    .sort((a, b) => b.resto - a.resto);
  for (const { i } of ordemResto) {
    if (sobra <= 0) break;
    pisos[i] += 1;
    sobra -= 1;
  }

  const resultado = new Map<number, number>();
  for (let i = 0; i < shares.length; i++) {
    resultado.set(shares[i].pessoaId, (resultado.get(shares[i].pessoaId) ?? 0) + pisos[i]);
  }
  return resultado;
}

// Percentuais explícitos valem como estão; NULL divide igualmente o que
// sobrar até 100. Se o total não fechar em 100, normaliza (e o chamador
// registra aviso). Total zero é rateio inválido — devolve null.
function resolverShares(rows: { pessoa_id: number; percentual: number | null }[]): { shares: Share[]; soma100: boolean } | null {
  const explicitos = rows.filter((r) => r.percentual !== null);
  const nulos = rows.filter((r) => r.percentual === null);
  const somaExplicita = explicitos.reduce((soma, r) => soma + Number(r.percentual), 0);
  const porNulo = nulos.length > 0 ? Math.max(0, 100 - somaExplicita) / nulos.length : 0;

  const shares: Share[] = rows.map((r) => ({
    pessoaId: r.pessoa_id,
    percentual: r.percentual !== null ? Number(r.percentual) : porNulo,
  }));

  const total = shares.reduce((soma, s) => soma + s.percentual, 0);
  if (total <= 0) return null;

  const soma100 = Math.abs(total - 100) < 0.01;
  if (!soma100) {
    for (const s of shares) s.percentual = (s.percentual * 100) / total;
  }
  return { shares, soma100 };
}

function centavosParaReais(cents: number): number {
  return Math.round(cents) / 100;
}

export async function calcularAcerto(casaId: number): Promise<AcertoContas | null> {
  const { rows: casaRows } = await pool.query('SELECT id, acerto_eixo FROM casas WHERE id = $1', [casaId]);
  if (casaRows.length === 0) return null;
  const eixoCasa: EixoAcerto = casaRows[0].acerto_eixo;

  const [{ rows: compras }, { rows: parcelasCaixa }, { rows: percentuais }, { rows: pagamentos }, { rows: membros }] =
    await Promise.all([
      pool.query(
        `SELECT c.id, c.competencia, c.acerto_eixo, c.cartao_conta_id, cc.titular_id,
                COALESCE((SELECT SUM(p.valor) FROM parcelas p WHERE p.compra_id = c.id), 0) AS valor_total
         FROM compras c
         LEFT JOIN cartoes_contas cc ON cc.id = c.cartao_conta_id
         WHERE c.casa_id = $1`,
        [casaId]
      ),
      pool.query(
        `SELECT compra_id, valor, data_caixa::text AS data_caixa
         FROM parcelas_com_caixa WHERE casa_id = $1`,
        [casaId]
      ),
      pool.query(
        'SELECT pessoa_id, competencia, percentual FROM percentuais_custeio WHERE casa_id = $1',
        [casaId]
      ),
      pool.query(
        `SELECT ap.id, ap.de_pessoa_id, pde.nome AS de_pessoa_nome,
                ap.para_pessoa_id, ppara.nome AS para_pessoa_nome,
                ap.valor, ap.data::text AS data, ap.observacao, ap.lancado_por_id
         FROM acerto_pagamentos ap
         JOIN pessoas pde ON pde.id = ap.de_pessoa_id
         JOIN pessoas ppara ON ppara.id = ap.para_pessoa_id
         WHERE ap.casa_id = $1
         ORDER BY ap.data DESC, ap.id DESC`,
        [casaId]
      ),
      pool.query(
        `SELECT p.id, p.nome FROM casa_pessoas cp JOIN pessoas p ON p.id = cp.pessoa_id
         WHERE cp.casa_id = $1 ORDER BY p.nome`,
        [casaId]
      ),
    ]);

  const pagadoresPorCompra = new Map<number, { pessoa_id: number; percentual: number | null }[]>();
  if (compras.length > 0) {
    const { rows: pagadores } = await pool.query(
      `SELECT cp.compra_id, cp.pessoa_id, cp.percentual
       FROM compra_pagadores cp JOIN compras c ON c.id = cp.compra_id
       WHERE c.casa_id = $1`,
      [casaId]
    );
    for (const p of pagadores) {
      if (!pagadoresPorCompra.has(p.compra_id)) pagadoresPorCompra.set(p.compra_id, []);
      (pagadoresPorCompra.get(p.compra_id) as any[]).push(p);
    }
  }

  const combinadoPorCompetencia = new Map<string, { pessoa_id: number; percentual: number | null }[]>();
  for (const pc of percentuais) {
    if (!combinadoPorCompetencia.has(pc.competencia)) combinadoPorCompetencia.set(pc.competencia, []);
    (combinadoPorCompetencia.get(pc.competencia) as any[]).push(pc);
  }

  const parcelasPorCompra = new Map<number, { valor: number; data_caixa: string }[]>();
  for (const p of parcelasCaixa) {
    if (!parcelasPorCompra.has(p.compra_id)) parcelasPorCompra.set(p.compra_id, []);
    (parcelasPorCompra.get(p.compra_id) as any[]).push(p);
  }

  // acumuladores mes → pessoa → {devido, desembolsado} em centavos
  const buckets = new Map<string, Map<number, { devido: number; desembolsado: number }>>();
  function bucket(mes: string, pessoaId: number) {
    if (!buckets.has(mes)) buckets.set(mes, new Map());
    const porPessoa = buckets.get(mes) as Map<number, { devido: number; desembolsado: number }>;
    if (!porPessoa.has(pessoaId)) porPessoa.set(pessoaId, { devido: 0, desembolsado: 0 });
    return porPessoa.get(pessoaId) as { devido: number; desembolsado: number };
  }

  const mesesSemCombinado = new Set<string>();
  const combinadoNaoSoma100 = new Set<string>();
  let comprasSemMeio = 0;
  let rateioNaoSoma100 = 0;

  for (const compra of compras) {
    // sem meio de pagamento não há desembolsador inferível — fora do acerto
    // por inteiro (incluir só o devido desbalancearia a soma-zero)
    if (compra.titular_id === null) {
      comprasSemMeio += 1;
      continue;
    }

    const rateioBruto = pagadoresPorCompra.get(compra.id) ?? combinadoPorCompetencia.get(compra.competencia);
    if (rateioBruto === undefined) {
      mesesSemCombinado.add(compra.competencia);
      continue;
    }

    const resolvido = resolverShares(rateioBruto);
    if (resolvido === null) {
      rateioNaoSoma100 += 1;
      continue;
    }
    if (!resolvido.soma100) {
      if (pagadoresPorCompra.has(compra.id)) rateioNaoSoma100 += 1;
      else combinadoNaoSoma100.add(compra.competencia);
    }

    const eixoEfetivo: EixoAcerto = compra.acerto_eixo ?? eixoCasa;
    const porcoes: { mes: string; valorCents: number }[] = eixoEfetivo === 'caixa'
      ? (parcelasPorCompra.get(compra.id) ?? []).map((p) => ({
          mes: dataParaCompetencia(p.data_caixa),
          valorCents: Math.round(Number(p.valor) * 100),
        }))
      : [{ mes: compra.competencia, valorCents: Math.round(Number(compra.valor_total) * 100) }];

    for (const porcao of porcoes) {
      bucket(porcao.mes, compra.titular_id).desembolsado += porcao.valorCents;
      for (const [pessoaId, cents] of ratear(porcao.valorCents, resolvido.shares)) {
        bucket(porcao.mes, pessoaId).devido += cents;
      }
    }
  }

  // pessoas envolvidas: membros da casa + qualquer id que apareceu nos
  // buckets ou pagamentos (ex.: titular de meio que saiu da casa)
  const nomes = new Map<number, string>(membros.map((m: any) => [m.id, m.nome]));
  const envolvidas = new Set<number>(nomes.keys());
  for (const porPessoa of buckets.values()) for (const id of porPessoa.keys()) envolvidas.add(id);
  for (const pg of pagamentos) {
    envolvidas.add(pg.de_pessoa_id);
    envolvidas.add(pg.para_pessoa_id);
  }
  const semNome = [...envolvidas].filter((id) => !nomes.has(id));
  if (semNome.length > 0) {
    const { rows } = await pool.query('SELECT id, nome FROM pessoas WHERE id = ANY($1)', [semNome]);
    for (const r of rows) nomes.set(r.id, r.nome);
  }

  const totais = new Map<number, { devido: number; desembolsado: number; enviados: number; recebidos: number }>();
  function total(pessoaId: number) {
    if (!totais.has(pessoaId)) totais.set(pessoaId, { devido: 0, desembolsado: 0, enviados: 0, recebidos: 0 });
    return totais.get(pessoaId) as { devido: number; desembolsado: number; enviados: number; recebidos: number };
  }
  for (const id of envolvidas) total(id);
  for (const porPessoa of buckets.values()) {
    for (const [pessoaId, valores] of porPessoa) {
      total(pessoaId).devido += valores.devido;
      total(pessoaId).desembolsado += valores.desembolsado;
    }
  }
  for (const pg of pagamentos) {
    const cents = Math.round(Number(pg.valor) * 100);
    total(pg.de_pessoa_id).enviados += cents;
    total(pg.para_pessoa_id).recebidos += cents;
  }

  const saldos: SaldoPessoa[] = [...totais.entries()]
    .map(([pessoaId, t]) => ({
      pessoa_id: pessoaId,
      nome: nomes.get(pessoaId) ?? `Pessoa ${pessoaId}`,
      devido: centavosParaReais(t.devido),
      desembolsado: centavosParaReais(t.desembolsado),
      pagamentos_enviados: centavosParaReais(t.enviados),
      pagamentos_recebidos: centavosParaReais(t.recebidos),
      saldo: centavosParaReais(t.desembolsado - t.devido + t.enviados - t.recebidos),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const meses: AcertoMes[] = [...buckets.entries()]
    .sort((a, b) => competenciaParaData(b[0]).localeCompare(competenciaParaData(a[0])))
    .map(([mes, porPessoa]) => ({
      mes,
      por_pessoa: [...porPessoa.entries()]
        .map(([pessoaId, valores]) => ({
          pessoa_id: pessoaId,
          nome: nomes.get(pessoaId) ?? `Pessoa ${pessoaId}`,
          devido: centavosParaReais(valores.devido),
          desembolsado: centavosParaReais(valores.desembolsado),
          acerto: centavosParaReais(valores.desembolsado - valores.devido),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    }));

  const avisos: AvisoAcerto[] = [];
  if (mesesSemCombinado.size > 0) {
    avisos.push({
      tipo: 'meses_sem_combinado',
      mensagem: `Compras fora do acerto: sem percentual de custeio registrado para ${[...mesesSemCombinado].sort().join(', ')}`,
      quantidade: mesesSemCombinado.size,
    });
  }
  if (comprasSemMeio > 0) {
    avisos.push({
      tipo: 'compras_sem_meio',
      mensagem: `${comprasSemMeio} compra(s) sem cartão/conta — desembolsador desconhecido, fora do acerto`,
      quantidade: comprasSemMeio,
    });
  }
  if (rateioNaoSoma100 > 0) {
    avisos.push({
      tipo: 'rateio_nao_soma_100',
      mensagem: `${rateioNaoSoma100} compra(s) com rateio de pagadores que não soma 100% — percentuais normalizados`,
      quantidade: rateioNaoSoma100,
    });
  }
  if (combinadoNaoSoma100.size > 0) {
    avisos.push({
      tipo: 'combinado_nao_soma_100',
      mensagem: `Percentual de custeio não soma 100% em ${[...combinadoNaoSoma100].sort().join(', ')} — percentuais normalizados`,
      quantidade: combinadoNaoSoma100.size,
    });
  }

  return {
    casa_id: casaId,
    acerto_eixo: eixoCasa,
    saldos,
    meses,
    pagamentos: pagamentos.map((pg: any) => ({ ...pg, valor: Number(pg.valor) })),
    avisos,
  };
}
