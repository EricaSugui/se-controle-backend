#!/usr/bin/env bash
#
# Gera as imagens dos diagramas de experimento/FIGURAS.md:
#
#   npm run exp:figuras
#
# Saída em experimento/figuras/: figura-N.png (2x, fundo branco, para o
# documento) e figura-N.svg, na ordem em que os diagramas aparecem no
# arquivo. Usa o mermaid-cli (devDependency), que abre um navegador
# headless. Rodar de novo sempre que um diagrama mudar.
#
# A saída não é idêntica byte a byte entre gerações: na Figura 3 (que tem
# um laço), as coordenadas das curvas variam em décimos de pixel, sem
# diferença visível. Commitar as imagens só quando um diagrama mudar; se
# nada mudou, descartar com git checkout -- experimento/figuras.

set -euo pipefail
cd "$(dirname "$0")/../.."   # raiz do back

ORIGEM="experimento/FIGURAS.md"
DESTINO="experimento/figuras"
MMDC="node_modules/.bin/mmdc"

[ -x "$MMDC" ] || { echo "mermaid-cli não encontrado. Rode npm install no back."; exit 1; }
mkdir -p "$DESTINO"

# O mmdc, com um .md de entrada, grava figura-1, figura-2... e um .md com
# os links para as imagens, que não é usado e é apagado no fim.
"$MMDC" -q -i "$ORIGEM" -o "$DESTINO/figura.md" -e png -s 2 -b white
"$MMDC" -q -i "$ORIGEM" -o "$DESTINO/figura.md" -e svg
rm -f "$DESTINO/figura.md"

echo "✓ Figuras geradas em $DESTINO:"
ls "$DESTINO"
