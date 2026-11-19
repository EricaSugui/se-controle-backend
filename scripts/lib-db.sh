#!/usr/bin/env bash
#
# Funções comuns aos scripts de backup e restauração (backup-db.sh,
# restore-test-db.sh, restore-db.sh). Uso: `source scripts/lib-db.sh`
# a partir da raiz do back.

BACKUP_DIR="${BACKUP_DIR:-$HOME/se-controle-backups}"
IMAGEM_PSQL="postgres:17-alpine"

# Docker Desktop instalado por usuário pode não estar no PATH de terminais
# abertos antes da instalação.
preparar_docker() {
  local d
  for d in "${LOCALAPPDATA:-}/Programs/DockerDesktop/resources/bin" "/c/Program Files/Docker/Docker/resources/bin"; do
    [ -d "$d" ] && PATH="$PATH:$d"
  done
  command -v docker >/dev/null || { echo "Docker não encontrado. Instale/abra o Docker Desktop."; exit 1; }
  docker info >/dev/null 2>&1 || { echo "Docker não está rodando. Abra o Docker Desktop e tente de novo."; exit 1; }
}

# Ref do projeto Supabase a partir da URL (usuário do pooler
# "postgres.<ref>" ou host "db.<ref>.supabase.co). Lê a URL de $U.
ref_da_url() {
  node -e '
    const u = new URL(process.env.U);
    const m = decodeURIComponent(u.username).match(/^postgres\.(.+)$/) || u.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
    process.stdout.write(m ? m[1] : u.hostname);
  '
}

url_tcc() {
  node -e 'require("dotenv").config({ path: ".env.tcc", quiet: true }); process.stdout.write(process.env.DATABASE_URL || "")'
}

eh_url_local() {
  echo "$1" | grep -qE '@(127\.0\.0\.1|localhost|host\.docker\.internal)[:/]'
}

# Restauração precisa de uma sessão própria do começo ao fim: troca o
# transaction pooler (6543) pelo session pooler (5432) do mesmo host.
url_de_sessao() {
  U="$1" node -e '
    const u = new URL(process.env.U);
    if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") u.port = "5432";
    process.stdout.write(u.toString());
  '
}

# Backup mais recente de um ambiente (só backups regulares, com carimbo
# AAAAMMDD-HHMMSS logo após o ambiente; ignora os de segurança
# "<amb>-pre-restauracao-*").
backup_mais_recente() {
  ls "$BACKUP_DIR"/"$1"-[0-9]*.tar.gz.enc 2>/dev/null | sort | tail -1 || true
}

# Resolve o argumento (prod | tcc | caminho) para um caminho absoluto.
resolver_backup() {
  local alvo="$1" arq
  case "$alvo" in
    prod|tcc)
      arq=$(backup_mais_recente "$alvo")
      [ -n "$arq" ] || { echo "Nenhum backup de $alvo em $BACKUP_DIR. Gere com: npm run db:backup:$alvo" >&2; return 1; }
      ;;
    *) arq="$alvo" ;;
  esac
  [ -f "$arq" ] || { echo "Arquivo não encontrado: $arq" >&2; return 1; }
  echo "$(cd "$(dirname "$arq")" && pwd)/$(basename "$arq")"
}

pedir_senha_backup() {
  if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
    read -rsp "Senha do backup: " BACKUP_PASSPHRASE; echo
  fi
  export BACKUP_PASSPHRASE
}

# Confere o .sha256 (se existir) e descriptografa $1 em $2.
descriptografar_backup() {
  local arq="$1" destino="$2" f
  if [ -f "$arq.sha256" ]; then
    echo "→ Conferindo integridade (sha256)..."
    ( cd "$(dirname "$arq")" && sha256sum -c --quiet "$(basename "$arq").sha256" )
  fi
  echo "→ Descriptografando..."
  mkdir -p "$destino"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$arq" \
    | tar -xzf - -C "$destino" \
    || { echo "Falha ao descriptografar (senha errada ou arquivo corrompido)."; exit 1; }
  for f in roles.sql schema.sql data.sql manifest.json; do
    [ -f "$destino/$f" ] || { echo "Backup incompleto: falta $f"; exit 1; }
  done
}

# Papéis reservados do Supabase já existem em qualquer projeto e só podem
# ser alterados pela plataforma (ex.: ALTER ROLE "supabase_admin" ...).
# Separa $1 (roles.sql) em $2 (mantidos) e $3 (descartados) e lista os
# descartados.
filtrar_roles() {
  local entrada="$1" mantidos="$2" descartados="$3"
  local res='anon|authenticated|service_role|authenticator|dashboard_user|pgbouncer|supabase_[a-z_]+|pgsodium_[a-z_]+'
  # Só comandos SOBRE um papel reservado: alvo do CREATE/ALTER/DROP/COMMENT
  # ON ROLE, ou destinatário (TO/FROM) do GRANT/REVOKE.
  local sobre="^[[:space:]]*((CREATE|ALTER|DROP)[[:space:]]+ROLE|COMMENT[[:space:]]+ON[[:space:]]+ROLE)[[:space:]]+\"?($res)\"?([[:space:];]|$)"
  local destino="^[[:space:]]*(GRANT|REVOKE)[[:space:]].*[[:space:]](TO|FROM)[[:space:]]+\"?($res)\"?([[:space:];,]|$)"
  grep -E  -e "$sobre" -e "$destino" "$entrada" > "$descartados" || true
  grep -vE -e "$sobre" -e "$destino" "$entrada" > "$mantidos" || true
  if [ -s "$descartados" ]; then
    echo "→ Ignorando $(wc -l < "$descartados" | tr -d ' ') comando(s) sobre papéis reservados do Supabase:"
    cut -c1-110 "$descartados" | sed 's/^/    /'
  fi
}

# Executa o SQL da entrada padrão no banco $1, numa transação única, com
# psql num container (sem instalar nada). Banco local (127.0.0.1) é
# acessado pelo host do Docker.
executar_sql() {
  local url="$1" ssl="require"
  if eh_url_local "$url"; then
    url=$(echo "$url" | sed -E 's/@(127\.0\.0\.1|localhost)([:/])/@host.docker.internal\2/')
    ssl="disable"
  fi
  docker run --rm -i -e PGURI="$url" -e PGSSLMODE="$ssl" "$IMAGEM_PSQL" \
    sh -c 'psql "$PGURI" -X -q --single-transaction -v ON_ERROR_STOP=1 -v VERBOSITY=default --echo-errors' \
    >/dev/null
}

# Gera o manifesto do banco $1 (rótulo $2) no arquivo $3.
gerar_manifesto() {
  DB_MANIFEST_URL="$1" node scripts/db-manifest.js "$2" > "$3"
}

# Compara dois manifestos. Com $3 = "app", só as tabelas public.* (auth e
# storage não são restaurados nesse modo). Sai com erro se divergir.
# Event triggers: no modo app, divergência é ERRO (a restauração os
# preserva); nos demais (projeto novo, instância descartável), é AVISO,
# porque não vêm no dump e dependem da plataforma.
comparar_manifestos() {
  node -e '
    const [origem, atual] = process.argv.slice(1, 3).map((f) => require(f));
    const soApp = process.argv[3] === "app";
    let eventTriggersOk = true;
    if (Array.isArray(origem.event_triggers) && Array.isArray(atual.event_triggers)) {
      const chave = (e) => `${e.nome} (${e.evento} → ${e.funcao})`;
      const o = new Set(origem.event_triggers.map(chave)), a = new Set(atual.event_triggers.map(chave));
      const faltando = [...o].filter((x) => !a.has(x));
      if (faltando.length) {
        eventTriggersOk = !soApp;
        console.log(`\n${soApp ? "✗" : "⚠"} Event triggers do backup ausentes no banco restaurado:`);
        for (const f of faltando) console.log(`    ${f}`);
        if (!soApp) console.log("  (não vêm no dump; num projeto novo, recrie conforme backup-restauracao.md)");
      }
    }
    const filtra = (c) => Object.fromEntries(Object.entries(c).filter(([n]) => !soApp || n.startsWith("public.")));
    const o = filtra(origem.contagens), a = filtra(atual.contagens);
    const nomes = [...new Set([...Object.keys(o), ...Object.keys(a)])].sort();
    const divergentes = nomes.filter((n) => o[n] !== a[n]);
    const migracaoOk = origem.ultima_migration === atual.ultima_migration;
    const soma = (c) => Object.values(c).reduce((x, y) => x + y, 0);
    console.log(`\nBackup de ${origem.ambiente} gerado em ${origem.gerado_em}`);
    console.log(`  última migration: ${origem.ultima_migration ?? "—"} → ${migracaoOk ? "igual" : "DIFERENTE: " + atual.ultima_migration}`);
    console.log(`  tabelas${soApp ? " do app (public)" : ""}: ${Object.keys(o).length} → ${Object.keys(a).length} · linhas: ${soma(o)} → ${soma(a)}`);
    for (const n of divergentes) console.log(`  ✗ ${n}: ${o[n] ?? "ausente"} → ${a[n] ?? "ausente"}`);
    if (divergentes.length || !migracaoOk || !eventTriggersOk) { console.log("\n✗ RESTAURAÇÃO DIVERGENTE"); process.exit(1); }
    console.log("\n✔ Restauração conferida: todas as contagens batem.");
  ' "$1" "$2" "${3:-}"
}
