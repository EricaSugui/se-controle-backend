#!/usr/bin/env bash
#
# Backup lógico CRIPTOGRAFADO de um banco Supabase (PROD ou TCC), no
# formato recomendado pelo Supabase: roles.sql + schema.sql + data.sql
# gerados pela CLI (`supabase db dump`), mais um manifesto com versão,
# última migration e contagem de linhas por tabela.
#
#   npm run db:backup:prod   → pede a DATABASE_URL de PROD (não aparece na
#                              tela, não é salva em lugar nenhum)
#   npm run db:backup:tcc    → usa a DATABASE_URL de back/.env.tcc
#
# Saída: $BACKUP_DIR (padrão ~/se-controle-backups), FORA do repositório:
#   <ambiente>-AAAAMMDD-HHMMSS.tar.gz.enc      (AES-256, chave derivada da senha)
#   <ambiente>-AAAAMMDD-HHMMSS.tar.gz.enc.sha256
#
# A senha do backup é pedida na hora (ou BACKUP_PASSPHRASE, para automação)
# e deve ficar no cofre de senhas: sem ela o backup é irrecuperável.
# Requer Docker Desktop rodando (a CLI do Supabase executa o pg_dump num
# container com a versão certa do Postgres).
#
# Procedimento completo: se-controle-workspace/docs/ambiente/backup-restauracao.md

set -euo pipefail

AMBIENTE="${1:?Informe o ambiente: prod ou tcc}"
cd "$(dirname "$0")/.."

# Docker Desktop instalado por usuário pode não estar no PATH de terminais
# abertos antes da instalação.
for d in "${LOCALAPPDATA:-}/Programs/DockerDesktop/resources/bin" "/c/Program Files/Docker/Docker/resources/bin"; do
  [ -d "$d" ] && PATH="$PATH:$d"
done
command -v docker >/dev/null || { echo "Docker não encontrado. Instale/abra o Docker Desktop."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker não está rodando. Abra o Docker Desktop e tente de novo."; exit 1; }
command -v openssl >/dev/null || { echo "openssl não encontrado (use o Git Bash)."; exit 1; }

# Ref do projeto Supabase a partir da URL (usuário do pooler "postgres.<ref>"
# ou host "db.<ref>.supabase.co"). Usado só para comparar ambientes.
ref_da_url() {
  node -e '
    const u = new URL(process.env.U);
    const m = decodeURIComponent(u.username).match(/^postgres\.(.+)$/) || u.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
    process.stdout.write(m ? m[1] : u.hostname);
  '
}

URL_TCC=$(node -e 'require("dotenv").config({ path: ".env.tcc", quiet: true }); process.stdout.write(process.env.DATABASE_URL || "")')

case "$AMBIENTE" in
  prod)
    if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
      read -rsp "Cole a DATABASE_URL de PROD (Railway → Variables). Ela não aparece na tela e não é salva: " BACKUP_DATABASE_URL
      echo
    fi
    URL="$BACKUP_DATABASE_URL"
    # Guardas: não confundir PROD com TCC ou com o banco local.
    if echo "$URL" | grep -qE '@(127\.0\.0\.1|localhost)[:/]'; then
      echo "Essa URL é de um banco local, não de PROD."; exit 1
    fi
    if [ -n "$URL_TCC" ] && [ "$(U="$URL" ref_da_url)" = "$(U="$URL_TCC" ref_da_url)" ]; then
      echo "Essa URL é do projeto do TCC, não de PROD."; exit 1
    fi
    ;;
  tcc)
    [ -n "$URL_TCC" ] || { echo "DATABASE_URL não encontrada em .env.tcc"; exit 1; }
    URL="$URL_TCC"
    ;;
  *)
    echo "Ambiente inválido: $AMBIENTE (use prod ou tcc)"; exit 1 ;;
esac

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  read -rsp "Senha do backup (guarde no cofre; mínimo 12 caracteres): " BACKUP_PASSPHRASE; echo
  read -rsp "Repita a senha: " CONFIRMA; echo
  [ "$BACKUP_PASSPHRASE" = "$CONFIRMA" ] || { echo "As senhas não conferem."; exit 1; }
fi
[ ${#BACKUP_PASSPHRASE} -ge 12 ] || { echo "Senha muito curta (mínimo 12 caracteres)."; exit 1; }
export BACKUP_PASSPHRASE

BACKUP_DIR="${BACKUP_DIR:-$HOME/se-controle-backups}"
mkdir -p "$BACKUP_DIR"
CARIMBO=$(date +%Y%m%d-%H%M%S)
SAIDA="$BACKUP_DIR/${AMBIENTE}-${CARIMBO}.tar.gz.enc"

# Arquivos em texto claro só existem nesta pasta temporária, apagada ao sair
# (inclusive em caso de erro).
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "→ [$AMBIENTE] Gerando dump (roles, schema, dados) — pode levar alguns minutos..."
npx supabase db dump --remote="$URL" --role-only -f "$TMP/roles.sql" >/dev/null
npx supabase db dump --remote="$URL" -f "$TMP/schema.sql" >/dev/null
npx supabase db dump --remote="$URL" --data-only --use-copy \
  -x storage.buckets_vectors -x storage.vector_indexes \
  -f "$TMP/data.sql" >/dev/null

echo "→ [$AMBIENTE] Gerando manifesto (versão, última migration, contagens)..."
DB_MANIFEST_URL="$URL" node scripts/db-manifest.js "$AMBIENTE" > "$TMP/manifest.json"

echo "→ Criptografando..."
tar -czf - -C "$TMP" roles.sql schema.sql data.sql manifest.json \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -out "$SAIDA"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$SAIDA")" > "$(basename "$SAIDA").sha256" )

node -e '
  const m = require(process.argv[1]);
  console.log(`\n✔ Backup ${m.ambiente} concluído`);
  console.log(`  Postgres ${m.postgres} · última migration: ${m.ultima_migration ?? "—"}`);
  console.log(`  ${m.tabelas} tabelas · ${m.linhas_total} linhas (inclui auth.users)`);
' "$TMP/manifest.json"
echo "  Arquivo: $SAIDA ($(du -h "$SAIDA" | cut -f1))"
echo
echo "Próximos passos: guarde a senha no cofre; copie o .enc e o .sha256 para fora"
echo "da máquina; teste a restauração com: npm run db:restore-test -- $AMBIENTE"
