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
# Com BACKUP_ROTULO=x o nome vira <ambiente>-x-AAAAMMDD-HHMMSS (usado pelo
# backup de segurança da restauração; não entra no "mais recente").
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
source scripts/lib-db.sh

preparar_docker
command -v openssl >/dev/null || { echo "openssl não encontrado (use o Git Bash)."; exit 1; }

URL_TCC=$(url_tcc)

case "$AMBIENTE" in
  prod)
    if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
      read -rsp "Cole a DATABASE_URL de PROD (Railway → Variables). Ela não aparece na tela e não é salva: " BACKUP_DATABASE_URL
      echo
    fi
    URL="$BACKUP_DATABASE_URL"
    # Guardas: não confundir PROD com TCC ou com o banco local.
    if eh_url_local "$URL"; then
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

mkdir -p "$BACKUP_DIR"
CARIMBO=$(date +%Y%m%d-%H%M%S)
NOME="${AMBIENTE}${BACKUP_ROTULO:+-$BACKUP_ROTULO}-${CARIMBO}"
SAIDA="$BACKUP_DIR/${NOME}.tar.gz.enc"

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
gerar_manifesto "$URL" "$AMBIENTE" "$TMP/manifest.json"

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
if [ -z "${BACKUP_ROTULO:-}" ]; then
  echo
  echo "Próximos passos: guarde a senha no cofre; confira a sincronização do"
  echo "OneDrive; teste a restauração com: npm run db:restore-test -- $AMBIENTE"
fi
