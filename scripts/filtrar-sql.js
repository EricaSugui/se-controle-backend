// Prepara um arquivo de dump (schema.sql ou data.sql gerado por
// `supabase db dump`) para restauração:
//
// 1. Converte SET de sessão em SET LOCAL (e set_config(..., false) em
//    set_config(..., true)): os ajustes valem só dentro da transação de
//    restauração e nunca "vazam" para outras conexões do pooler — inclusive
//    o `session_replication_role = replica` do próprio data.sql.
// 2. Com --schemas a,b: mantém apenas os blocos COPY e os setval de
//    sequências desses schemas (restauração parcial, ex.: só o app).
//
//   node scripts/filtrar-sql.js [--schemas public,private] < entrada.sql > saida.sql
//
// Lê da entrada padrão e escreve na saída padrão, linha a linha.

const readline = require('readline');

const i = process.argv.indexOf('--schemas');
const schemas = i >= 0 ? new Set(process.argv[i + 1].split(',').map((s) => s.trim())) : null;

const copyRe = /^COPY "([^"]+)"\./;
const setvalRe = /^SELECT pg_catalog\.setval\('"([^"]+)"\./;

let dentroDeCopy = false;
let manterCopy = true;
let descartados = 0;

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const out = process.stdout;

rl.on('line', (linha) => {
  if (dentroDeCopy) {
    if (manterCopy) out.write(linha + '\n');
    if (linha === '\\.') dentroDeCopy = false;
    return;
  }

  const copy = linha.match(copyRe);
  if (copy) {
    dentroDeCopy = true;
    manterCopy = !schemas || schemas.has(copy[1]);
    if (!manterCopy) descartados++;
    if (manterCopy) out.write(linha + '\n');
    return;
  }

  const setval = linha.match(setvalRe);
  if (setval && schemas && !schemas.has(setval[1])) return;

  if (/^SET (?!LOCAL )/.test(linha)) {
    out.write(linha.replace(/^SET /, 'SET LOCAL ') + '\n');
    return;
  }
  if (/set_config\('search_path', '', false\)/.test(linha)) {
    out.write(linha.replace("set_config('search_path', '', false)", "set_config('search_path', '', true)") + '\n');
    return;
  }
  out.write(linha + '\n');
});

rl.on('close', () => {
  if (dentroDeCopy) {
    console.error('filtrar-sql: arquivo terminou dentro de um bloco COPY (dump incompleto?)');
    process.exit(1);
  }
  if (schemas) console.error(`filtrar-sql: ${descartados} tabela(s) de outros schemas descartada(s)`);
});
