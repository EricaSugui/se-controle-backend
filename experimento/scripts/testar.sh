#!/usr/bin/env bash
#
# Roda os testes do experimento nas duas condições: recria o banco de
# medição do zero em A, testa, recria em B e testa de novo.
#
#   npm run exp:test            → A e B
#   npm run exp:test -- b       → só uma condição
#
# Os testes leem EXPERIMENTO_CONDICAO para saber o que esperar, e conferem
# que o banco está mesmo nessa condição.

set -euo pipefail
cd "$(dirname "$0")/../.."   # raiz do back

[ $# -gt 0 ] || set -- a b

for c in "$@"; do
  echo
  echo "════════ Condição ${c^^} ════════"
  bash experimento/scripts/recriar-banco.sh "$c"
  EXPERIMENTO_CONDICAO="$c" node_modules/.bin/jest -c experimento/jest.config.js --runInBand
done
