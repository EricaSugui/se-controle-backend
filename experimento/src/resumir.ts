// Consolida as rodadas de uma pasta (piloto ou coleta) em resumo.csv, uma
// linha por rodada, e imprime a comparação A × B pareada por semente.
//
//   npm run exp:resumir -- <pasta>

import * as fs from 'fs';
import * as path from 'path';

interface Resumo {
  condicao: 'a' | 'b';
  eventos: number;
  semente: number;
  operacoes: number;
  carga_ms: number;
  vazao_operacoes_s: number;
  vazao_eventos_s: number;
  latencia_ms: { geral: { media: number; desvio: number; mediana: number; p95: number; p99: number } };
  armazenamento: { eventos_total_bytes: number; cadeias_total_bytes: number; bytes_por_evento: number };
  verificacao: { total_ms: number; falsos_positivos: number; eventos_verificados: number } | null;
  cenarios: Record<string, { tentativas: number; detectados: number; conformes: number }>;
}

const pasta = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(pasta)) {
  console.error('Uso: npm run exp:resumir -- <pasta com as rodadas>');
  process.exit(64);
}

const rodadas: Array<Resumo & { rodada: string }> = fs.readdirSync(pasta)
  .filter((d) => fs.existsSync(path.join(pasta, d, 'resumo.json')))
  .map((d) => ({ rodada: d, ...JSON.parse(fs.readFileSync(path.join(pasta, d, 'resumo.json'), 'utf8')) }))
  .sort((x, y) => x.eventos - y.eventos || x.semente - y.semente || x.condicao.localeCompare(y.condicao));

const soma = (r: Resumo, campo: 'tentativas' | 'detectados' | 'conformes') =>
  Object.values(r.cenarios).reduce((s, v) => s + v[campo], 0);

const linhas = rodadas.map((r) => ({
  rodada: r.rodada, condicao: r.condicao.toUpperCase(), eventos: r.eventos, semente: r.semente,
  operacoes: r.operacoes, carga_s: (r.carga_ms / 1000).toFixed(3),
  vazao_operacoes_s: r.vazao_operacoes_s.toFixed(1), vazao_eventos_s: r.vazao_eventos_s.toFixed(1),
  latencia_media_ms: r.latencia_ms.geral.media.toFixed(3), latencia_desvio_ms: r.latencia_ms.geral.desvio.toFixed(3),
  latencia_mediana_ms: r.latencia_ms.geral.mediana.toFixed(3), latencia_p95_ms: r.latencia_ms.geral.p95.toFixed(3),
  latencia_p99_ms: r.latencia_ms.geral.p99.toFixed(3),
  auditoria_bytes: r.armazenamento.eventos_total_bytes + r.armazenamento.cadeias_total_bytes,
  bytes_por_evento: r.armazenamento.bytes_por_evento.toFixed(1),
  verificacao_ms: r.verificacao ? r.verificacao.total_ms.toFixed(1) : '',
  falsos_positivos: r.verificacao ? r.verificacao.falsos_positivos : '',
  ataques: soma(r, 'tentativas'), detectados: soma(r, 'detectados'), conformes: soma(r, 'conformes'),
}));

const colunas = Object.keys(linhas[0] ?? {});
fs.writeFileSync(path.join(pasta, 'resumo.csv'),
  [colunas.join(','), ...linhas.map((l) => colunas.map((c) => (l as Record<string, unknown>)[c]).join(','))].join('\n') + '\n');
console.log(`✓ ${linhas.length} rodadas em ${path.join(pasta, 'resumo.csv')}`);

// Comparação pareada: B em relação a A, mesma semente e mesmo volume.
console.log('\nvolume semente | mediana A  B  (B/A) | p95 A  B | B/evento A  B (B/A) | verificação B | detectados A  B');
for (const b of rodadas.filter((r) => r.condicao === 'b')) {
  const a = rodadas.find((r) => r.condicao === 'a' && r.eventos === b.eventos && r.semente === b.semente);
  if (!a) continue;
  const f = (n: number, d = 2) => n.toFixed(d);
  console.log(`${b.eventos} s${b.semente} | ${f(a.latencia_ms.geral.mediana)} ${f(b.latencia_ms.geral.mediana)} `
    + `(${f(b.latencia_ms.geral.mediana / a.latencia_ms.geral.mediana)}) | `
    + `${f(a.latencia_ms.geral.p95)} ${f(b.latencia_ms.geral.p95)} | `
    + `${f(a.armazenamento.bytes_por_evento, 0)} ${f(b.armazenamento.bytes_por_evento, 0)} `
    + `(${f(b.armazenamento.bytes_por_evento / a.armazenamento.bytes_por_evento)}) | `
    + `${b.verificacao ? f(b.verificacao.total_ms, 0) + ' ms' : '-'} | `
    + `${soma(a, 'detectados')}/${soma(a, 'tentativas')} ${soma(b, 'detectados')}/${soma(b, 'tentativas')}`);
}
