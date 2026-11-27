// Linha de comando do checkpoint e do verificador (condição B).
//
//   npm run exp:checkpoint -- <arquivo.json>
//   npm run exp:verificar  -- <checkpoint.json> [relatorio.json]
//
// O verificador sai com código 0 se todas as Casas estão íntegras, 1 se
// alguma foi adulterada e 2 se alguma ficou inconclusiva.

import * as fs from 'fs';
import { conectar } from './banco';
import { criarCheckpoint, lerCheckpoint, salvarCheckpoint } from './checkpoint';
import { verificar } from './verificador';

async function main(): Promise<number> {
  const [comando, arquivo, saida] = process.argv.slice(2);
  if (!arquivo || (comando !== 'checkpoint' && comando !== 'verificar')) {
    console.error('Uso: cli.ts checkpoint <arquivo.json> | verificar <checkpoint.json> [relatorio.json]');
    return 64;
  }
  const client = await conectar();
  try {
    if (comando === 'checkpoint') {
      const checkpoint = await criarCheckpoint(client);
      salvarCheckpoint(checkpoint, arquivo);
      const eventos = checkpoint.cadeias.reduce((s, c) => s + Number(c.quantidade), 0);
      console.log(`✓ Checkpoint de ${checkpoint.cadeias.length} Casas (${eventos} eventos) em ${arquivo}`);
      return 0;
    }

    const relatorio = await verificar(client, lerCheckpoint(arquivo));
    if (saida) fs.writeFileSync(saida, JSON.stringify(relatorio, null, 2) + '\n');
    for (const c of relatorio.cadeias.filter((x) => x.situacao !== 'integra')) {
      console.log(`✗ Casa ${c.casa_id}: ${c.situacao}${c.motivo ? ` (${c.motivo})` : ''}`
        + `${c.indice ? ` no índice ${c.indice}` : ''}${c.detalhe ? ` — ${c.detalhe}` : ''}`);
    }
    const verificados = relatorio.cadeias.reduce((s, c) => s + c.eventos_verificados, 0);
    const naoProtegidos = relatorio.cadeias.reduce((s, c) => s + c.nao_protegidos, 0);
    console.log(`${relatorio.situacao === 'integra' ? '✓' : '✗'} ${relatorio.situacao}: `
      + `${relatorio.cadeias.length} Casas, ${verificados} eventos verificados, `
      + `${naoProtegidos} não protegidos, ${relatorio.total_ms.toFixed(1)} ms`);
    return { integra: 0, adulterada: 1, inconclusiva: 2 }[relatorio.situacao];
  } finally {
    await client.end();
  }
}

main().then((codigo) => process.exit(codigo), (err) => {
  console.error('Erro:', err.message);
  process.exit(70);
});
