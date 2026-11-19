#!/usr/bin/env bash
#
# RESTAURAÇÃO REAL de um backup gerado por backup-db.sh.
#
#   npm run db:restore:tcc  -- [arquivo]               modo APP (mesmo projeto)
#   npm run db:restore:prod -- [arquivo]               modo APP (mesmo projeto)
#   npm run db:restore:prod -- --completo [arquivo]    modo COMPLETO (projeto NOVO)
#
# Sem arquivo: usa o backup regular mais recente do ambiente.
#
# MODO APP (padrão) — cenários "migration estragou dados" e "dados apagados
# por engano". Restaura só os schemas do app (public e private) no MESMO
# projeto: app, web e APK continuam funcionando sem mudança; Auth (logins,
# sessões) e Storage não são tocados. Contas criadas depois do backup
# continuam existindo, mas ficam sem dados do app (o script informa quantas).
#   1. Backup de SEGURANÇA do estado atual (<amb>-pre-restauracao-*).
#   2. Numa ÚNICA transação: apaga todo o conteúdo de public e private,
#      recria a estrutura do backup e carrega os dados do backup.
#      Se qualquer comando falhar, NADA muda no banco.
#   3. Confere contagens e última migration contra o manifesto do backup.
#
# MODO COMPLETO — cenário "projeto perdido". Restaura tudo (roles, schema,
# dados, inclusive Auth) num projeto Supabase NOVO e vazio. Depois é
# preciso reapontar Railway, Vercel e o app (o script lista os passos).
#
# Recusa restaurar backup de um ambiente em outro (ex.: PROD no TCC).
# Requer Docker Desktop. Confirmação digitada (ou RESTORE_CONFIRMACAO).
# Procedimento: se-controle-workspace/docs/ambiente/backup-restauracao.md

set -euo pipefail

AMBIENTE="${1:?Informe o ambiente: prod ou tcc}"
shift
MODO="app"
ARQ_ARG=""
for a in "$@"; do
  case "$a" in
    --completo) MODO="completo" ;;
    *) ARQ_ARG="$a" ;;
  esac
done
case "$AMBIENTE" in prod|tcc) ;; *) echo "Ambiente inválido: $AMBIENTE (use prod ou tcc)"; exit 1 ;; esac

cd "$(dirname "$0")/.."
source scripts/lib-db.sh

ARQUIVO=$(resolver_backup "${ARQ_ARG:-$AMBIENTE}")
preparar_docker
pedir_senha_backup

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
descriptografar_backup "$ARQUIVO" "$TMP/backup"
MANIFESTO="$TMP/backup/manifest.json"

AMB_BACKUP=$(node -e 'process.stdout.write(require(process.argv[1]).ambiente)' "$MANIFESTO")
if [ "$AMB_BACKUP" != "$AMBIENTE" ]; then
  echo "Este backup é de '$AMB_BACKUP' e não pode ser restaurado em '$AMBIENTE'."; exit 1
fi

URL_TCC=$(url_tcc)

# ── Banco de destino ────────────────────────────────────────────────────
if [ "$MODO" = "app" ]; then
  if [ "$AMBIENTE" = "tcc" ]; then
    [ -n "$URL_TCC" ] || { echo "DATABASE_URL não encontrada em .env.tcc"; exit 1; }
    URL="$URL_TCC"
  else
    if [ -z "${RESTORE_DATABASE_URL:-}" ]; then
      read -rsp "Cole a DATABASE_URL de PROD (Railway → Variables). Ela não aparece na tela e não é salva: " RESTORE_DATABASE_URL
      echo
    fi
    URL="$RESTORE_DATABASE_URL"
    eh_url_local "$URL" && { echo "Essa URL é de um banco local, não de PROD."; exit 1; }
    if [ -n "$URL_TCC" ] && [ "$(U="$URL" ref_da_url)" = "$(U="$URL_TCC" ref_da_url)" ]; then
      echo "Essa URL é do projeto do TCC, não de PROD."; exit 1
    fi
  fi
else
  if [ -z "${RESTORE_DATABASE_URL:-}" ]; then
    read -rsp "Cole a DATABASE_URL do projeto Supabase NOVO e vazio (não aparece na tela): " RESTORE_DATABASE_URL
    echo
  fi
  URL="$RESTORE_DATABASE_URL"
  if eh_url_local "$URL" && [ "${RESTORE_PERMITE_LOCAL:-}" != "1" ]; then
    echo "Essa URL é de um banco local."; exit 1
  fi
  if [ "$AMBIENTE" = "prod" ] && [ -n "$URL_TCC" ] && [ "$(U="$URL" ref_da_url)" = "$(U="$URL_TCC" ref_da_url)" ]; then
    echo "Essa URL é do projeto do TCC: dados de PROD nunca vão para o TCC."; exit 1
  fi
fi
URL_SESSAO=$(url_de_sessao "$URL")
DESTINO_DESC=$(U="$URL" node -e 'const u=new URL(process.env.U); console.log(u.hostname + " (projeto " + (decodeURIComponent(u.username).split(".")[1] || "local") + ")")')

if [ "$MODO" = "completo" ]; then
  N_TABELAS=$(DB_MANIFEST_URL="$URL" node -e '
    const { Client } = require("pg");
    const url = process.env.DB_MANIFEST_URL;
    const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
    const c = new Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
    c.connect().then(() => c.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = $1", ["public"]))
     .then((r) => { process.stdout.write(String(r.rows[0].n)); return c.end(); })
     .catch((e) => { console.error(e.message); process.exit(1); });')
  [ "$N_TABELAS" = "0" ] || { echo "O projeto de destino não está vazio ($N_TABELAS tabelas em public). O modo completo só restaura em projeto novo."; exit 1; }
fi

# ── Resumo e confirmação ────────────────────────────────────────────────
node -e '
  const m = require(process.argv[1]);
  const soma = Object.entries(m.contagens).filter(([n]) => n.startsWith("public.")).reduce((a, [, v]) => a + v, 0);
  console.log(`\nBackup: ${process.argv[2]}`);
  console.log(`  gerado em ${m.gerado_em} · última migration ${m.ultima_migration ?? "—"} · ${soma} linhas do app`);
' "$MANIFESTO" "$(basename "$ARQUIVO")"
echo "Destino: ${AMBIENTE^^} — $DESTINO_DESC"
if [ "$MODO" = "app" ]; then
  cat <<EOF

MODO APP — o que vai acontecer:
  1. Backup de segurança do estado ATUAL (para poder desfazer).
  2. Todo o conteúdo dos schemas public e private é APAGADO e recriado a
     partir do backup (transação única: se falhar, nada muda).
  3. Auth (logins, sessões) e Storage NÃO mudam. Contas criadas depois do
     backup continuam existindo, mas ficam SEM dados do app.
EOF
else
  cat <<EOF

MODO COMPLETO — restaura roles, schema e dados (inclusive Auth) no projeto
NOVO acima. Depois será preciso reapontar Railway, Vercel e o app.
EOF
fi
ESPERADO="RESTAURAR ${AMBIENTE^^}"
if [ -z "${RESTORE_CONFIRMACAO:-}" ]; then
  echo
  read -rp "Para confirmar, digite exatamente: $ESPERADO → " RESTORE_CONFIRMACAO
fi
[ "$RESTORE_CONFIRMACAO" = "$ESPERADO" ] || { echo "Confirmação não confere. Nada foi alterado."; exit 1; }

# ── Restauração ─────────────────────────────────────────────────────────
if [ "$MODO" = "app" ]; then
  echo "→ Backup de segurança do estado atual..."
  BACKUP_ROTULO="pre-restauracao" BACKUP_DATABASE_URL="$URL" bash scripts/backup-db.sh "$AMBIENTE" \
    | grep -E "✔|Arquivo:" || { echo "Falha no backup de segurança. Nada foi alterado."; exit 1; }

  echo "→ Restaurando public e private (transação única)..."
  {
    cat <<'SQL'
SET LOCAL search_path = '';
-- Event triggers que chamam funções do app (ex.: ensure_rls →
-- public.rls_auto_enable, criado pela plataforma Supabase) cairiam em
-- cascata com as funções e NÃO vêm no dump: guarda a definição para
-- recriá-los depois da estrutura.
CREATE TEMP TABLE _event_triggers_app ON COMMIT DROP AS
  SELECT e.evtname, e.evtevent, e.evttags, e.evtenabled, p.oid::regprocedure::text AS funcao
  FROM pg_event_trigger e
  JOIN pg_proc p ON p.oid = e.evtfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private');
-- Apaga todo o conteúdo dos schemas do app, preservando os próprios
-- schemas (dono e permissões) e objetos de extensões.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname IN ('public', 'private') AND c.relkind IN ('v', 'm')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP %s IF EXISTS %I.%I CASCADE',
                   CASE r.relkind WHEN 'v' THEN 'VIEW' ELSE 'MATERIALIZED VIEW' END, r.nspname, r.relname);
  END LOOP;
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname IN ('public', 'private') AND c.relkind IN ('r', 'p', 'f')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', r.nspname, r.relname);
  END LOOP;
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname IN ('public', 'private') AND c.relkind = 'S'
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I.%I CASCADE', r.nspname, r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS assinatura, p.prokind FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname IN ('public', 'private')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP %s IF EXISTS %s CASCADE',
                   CASE r.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END, r.assinatura);
  END LOOP;
  FOR r IN SELECT n.nspname, t.typname, t.typtype FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname IN ('public', 'private')
             AND (t.typtype IN ('e', 'd', 'r', 'm')
                  OR (t.typtype = 'c' AND EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind = 'c')))
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP %s IF EXISTS %I.%I CASCADE',
                   CASE r.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, r.nspname, r.typname);
  END LOOP;
END $$;
SQL
    node scripts/filtrar-sql.js < "$TMP/backup/schema.sql"
    cat <<'SQL'
-- Recria os event triggers guardados antes da limpeza (funções já
-- recriadas pela estrutura acima).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_temp._event_triggers_app LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = r.evtname) THEN
      EXECUTE format('CREATE EVENT TRIGGER %I ON %s %s EXECUTE FUNCTION %s',
        r.evtname, r.evtevent,
        CASE WHEN r.evttags IS NULL THEN ''
             ELSE 'WHEN TAG IN (' || (SELECT string_agg(quote_literal(t), ', ') FROM unnest(r.evttags) t) || ')' END,
        r.funcao);
      IF r.evtenabled = 'D' THEN EXECUTE format('ALTER EVENT TRIGGER %I DISABLE', r.evtname);
      ELSIF r.evtenabled = 'R' THEN EXECUTE format('ALTER EVENT TRIGGER %I ENABLE REPLICA', r.evtname);
      ELSIF r.evtenabled = 'A' THEN EXECUTE format('ALTER EVENT TRIGGER %I ENABLE ALWAYS', r.evtname);
      END IF;
    END IF;
  END LOOP;
END $$;
SQL
    echo 'SET LOCAL session_replication_role = replica;'
    node scripts/filtrar-sql.js --schemas public,private < "$TMP/backup/data.sql" 2>/dev/null
  } | executar_sql "$URL_SESSAO"
else
  filtrar_roles "$TMP/backup/roles.sql" "$TMP/roles-filtrado.sql" "$TMP/roles-descartados.sql"
  echo "→ Restaurando tudo (roles → schema → dados, transação única)..."
  {
    cat "$TMP/roles-filtrado.sql"
    node scripts/filtrar-sql.js < "$TMP/backup/schema.sql"
    echo 'SET LOCAL session_replication_role = replica;'
    node scripts/filtrar-sql.js < "$TMP/backup/data.sql"
  } | executar_sql "$URL_SESSAO"
fi

# ── Conferência ─────────────────────────────────────────────────────────
echo "→ Conferindo contra o manifesto..."
gerar_manifesto "$URL" "$AMBIENTE" "$TMP/manifest-atual.json"
if [ "$MODO" = "app" ]; then
  comparar_manifestos "$MANIFESTO" "$TMP/manifest-atual.json" app
  node -e '
    const [b, a] = process.argv.slice(1).map((f) => require(f));
    if (a.usuarios_sem_pessoa != null) {
      const antes = b.usuarios_sem_pessoa;
      const novas = antes == null ? null : a.usuarios_sem_pessoa - antes;
      console.log(`\nContas do Auth sem dados do app: ${a.usuarios_sem_pessoa}` +
        (antes == null ? "" : ` (no backup: ${antes}; criadas depois do backup: ${novas})`));
      if (novas == null || novas > 0) {
        console.log("Essas pessoas precisam refazer o cadastro no app (onboarding) ou ter os dados recriados.");
      }
    }
  ' "$MANIFESTO" "$TMP/manifest-atual.json"
  echo
  echo "Para desfazer esta restauração: npm run db:restore:$AMBIENTE -- <arquivo ${AMBIENTE}-pre-restauracao-*.tar.gz.enc em $BACKUP_DIR>"
else
  comparar_manifestos "$MANIFESTO" "$TMP/manifest-atual.json"
  cat <<EOF

Próximos passos (projeto novo) — ver backup-restauracao.md, seção 6:
  1. Railway (${AMBIENTE^^}): DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY e
     SUPABASE_SERVICE_ROLE_KEY do projeto novo.
  2. Vercel (${AMBIENTE^^}): EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_API_KEY + novo deploy.
  3. front/.env.${AMBIENTE}: mesmas variáveis; gerar e distribuir APK novo.
  4. Supabase (projeto novo) → Authentication: Site URL, Redirect URLs, SMTP e
     modelos de e-mail (configuração do projeto não vem no backup).
  5. Recrie os event triggers apontados acima (ex.: ensure_rls), que não
     vêm no backup — SQL em backup-restauracao.md, seção 6.
  6. Usuários entram com a MESMA senha, mas todas as sessões antigas caem.
EOF
fi
