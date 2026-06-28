const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function adicionarMesesData(dataISO: string, meses: number): string {
  const data = new Date(dataISO);
  data.setUTCMonth(data.getUTCMonth() + meses);
  return data.toISOString().slice(0, 10);
}

export function adicionarMesesCompetencia(competencia: string, meses: number): string {
  const [mesAbrev, anoAbrev] = competencia.split('-');
  const indiceMes = MESES.indexOf(mesAbrev.toUpperCase());

  if (indiceMes === -1) throw new Error(`competencia inválida: ${competencia}`);

  const totalMeses = indiceMes + meses;
  const ano = 2000 + parseInt(anoAbrev, 10);
  const novoAno = ano + Math.floor(totalMeses / 12);
  const novoIndiceMes = ((totalMeses % 12) + 12) % 12;
  const novoAnoAbrev = String(novoAno % 100).padStart(2, '0');

  return `${MESES[novoIndiceMes]}-${novoAnoAbrev}`;
}

export function competenciaParaData(competencia: string): string {
  const [mesAbrev, anoAbrev] = competencia.split('-');
  const indiceMes = MESES.indexOf(mesAbrev.toUpperCase());

  if (indiceMes === -1) throw new Error(`competencia inválida: ${competencia}`);

  const ano = 2000 + parseInt(anoAbrev, 10);
  const mes = String(indiceMes + 1).padStart(2, '0');

  return `${ano}-${mes}-01`;
}

export function mesesEntre(competenciaInicio: string, competenciaFim: string): number {
  const [mesIniAbrev, anoIniAbrev] = competenciaInicio.split('-');
  const [mesFimAbrev, anoFimAbrev] = competenciaFim.split('-');

  const indiceMesIni = MESES.indexOf(mesIniAbrev.toUpperCase());
  const indiceMesFim = MESES.indexOf(mesFimAbrev.toUpperCase());

  if (indiceMesIni === -1) throw new Error(`competencia inválida: ${competenciaInicio}`);
  if (indiceMesFim === -1) throw new Error(`competencia inválida: ${competenciaFim}`);

  const totalMesesIni = (2000 + parseInt(anoIniAbrev, 10)) * 12 + indiceMesIni;
  const totalMesesFim = (2000 + parseInt(anoFimAbrev, 10)) * 12 + indiceMesFim;

  return totalMesesFim - totalMesesIni;
}
