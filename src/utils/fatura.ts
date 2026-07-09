import { adicionarMesesCompetencia, competenciaParaData, dataParaCompetencia } from './competencia';

export function calcularMesReferenciaFatura(
  dataCompraISO: string,
  diaFechamento: number,
  diaVencimento: number
): string {
  const diaCompra = new Date(dataCompraISO).getUTCDate();
  const competenciaCompra = dataParaCompetencia(dataCompraISO);

  const deslocFechamento = diaCompra <= diaFechamento ? 0 : 1;
  const competenciaFechamento = adicionarMesesCompetencia(competenciaCompra, deslocFechamento);

  const deslocVencimento = diaFechamento < diaVencimento ? 0 : 1;
  return adicionarMesesCompetencia(competenciaFechamento, deslocVencimento);
}

export function calcularDatasFatura(
  mesReferencia: string,
  diaFechamento: number,
  diaVencimento: number
): { data_fechamento: string; data_vencimento: string } {
  const mesFechamento = diaFechamento < diaVencimento
    ? mesReferencia
    : adicionarMesesCompetencia(mesReferencia, -1);

  const data_fechamento = montarDataClamped(mesFechamento, diaFechamento);
  const data_vencimento = montarDataClamped(mesReferencia, diaVencimento);

  if (data_fechamento >= data_vencimento) {
    throw new Error(
      `Configuração de dia_fechamento/dia_vencimento do cartão produz datas inválidas para ${mesReferencia}`
    );
  }

  return { data_fechamento, data_vencimento };
}

function montarDataClamped(competencia: string, diaDoMes: number): string {
  const [ano, mes] = competenciaParaData(competencia).split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(diaDoMes, ultimoDia);
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
