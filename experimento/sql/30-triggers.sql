-- Triggers de auditoria, iguais nas condições A e B (decisão 1; roteiro,
-- bloco 2). Montam o evento e chamam audit.gravar_evento, que é a única
-- parte diferente entre as condições (20-condicao-a.sql / -b.sql).
--
-- Tabelas auditadas: compras, parcelas (onde fica o valor) e receitas.
-- Cada linha inserida, alterada ou apagada gera um evento, na mesma
-- transação da operação.
--
-- Quem registrou (usuario_registrador_id):
--   - compras e receitas, INSERT: a coluna lancado_por_id da linha; se ela
--     estiver nula (linhas antigas), a variável app.usuario_id;
--   - parcelas, INSERT: app.usuario_id (na edição de uma compra, as
--     parcelas são recriadas por quem edita); se faltar, o lancado_por_id
--     da compra;
--   - UPDATE e DELETE: app.usuario_id, definida pela aplicação com
--     set_config('app.usuario_id', '<id>', true) dentro da transação.
-- Sem quem registrou, a operação é recusada: nenhum evento fica incompleto.

-- ---------------------------------------------------------------------
-- Peças comuns
-- ---------------------------------------------------------------------
CREATE FUNCTION audit.usuario_da_sessao() RETURNS integer
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.usuario_id', true), '')::integer $$;

CREATE FUNCTION audit.exigir_usuario(usuario integer, tabela text, operacao text) RETURNS integer
  LANGUAGE plpgsql IMMUTABLE
  AS $$
BEGIN
  IF usuario IS NULL THEN
    RAISE EXCEPTION 'auditoria: % em % sem usuário registrador', operacao, tabela
      USING HINT = 'Rode set_config(''app.usuario_id'', ''<id da pessoa>'', true) na mesma transação.',
            ERRCODE = 'not_null_violation';
  END IF;
  RETURN usuario;
END
$$;

-- {"antes": linha antiga ou null, "depois": linha nova ou null}
CREATE FUNCTION audit.conteudo(operacao text, antes jsonb, depois jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT jsonb_build_object(
      'antes',  CASE WHEN operacao = 'INSERT' THEN NULL ELSE antes END,
      'depois', CASE WHEN operacao = 'DELETE' THEN NULL ELSE depois END)
  $$;

CREATE FUNCTION audit.novo_evento(
  casa_id integer, operacao text, entidade text, entidade_id bigint,
  pessoa_responsavel_id integer, usuario_registrador_id integer,
  ocorrido_em timestamptz, conteudo jsonb
) RETURNS audit.eventos
  LANGUAGE plpgsql IMMUTABLE
  AS $$
DECLARE
  e audit.eventos;
BEGIN
  e.casa_id                := casa_id;
  e.operacao               := operacao;
  e.entidade               := entidade;
  e.entidade_id            := entidade_id;
  e.pessoa_responsavel_id  := pessoa_responsavel_id;
  e.usuario_registrador_id := usuario_registrador_id;
  e.ocorrido_em            := ocorrido_em;
  e.conteudo               := conteudo;
  RETURN e;
END
$$;

-- ---------------------------------------------------------------------
-- compras e receitas (têm casa_id, pessoa_id e lancado_por_id)
-- ---------------------------------------------------------------------
CREATE FUNCTION audit.registrar_lancamento() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  linha     record;
  usuario   integer := audit.usuario_da_sessao();
  conteudo  jsonb;
  ocorrido  timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'DELETE' THEN
    linha := OLD;
    conteudo := audit.conteudo(TG_OP, to_jsonb(OLD), NULL);
  ELSE
    linha := NEW;
    conteudo := audit.conteudo(TG_OP, CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW));
  END IF;

  IF TG_OP = 'INSERT' THEN
    usuario := coalesce(NEW.lancado_por_id, usuario);
  END IF;
  usuario := audit.exigir_usuario(usuario, TG_TABLE_NAME, TG_OP);

  -- Lançamento que muda de Casa: um evento na cadeia de origem e outro na
  -- de destino (decisão 2), com o mesmo conteúdo (antes e depois).
  IF TG_OP = 'UPDATE' AND OLD.casa_id IS DISTINCT FROM NEW.casa_id THEN
    PERFORM audit.gravar_evento(audit.novo_evento(
      OLD.casa_id, TG_OP, TG_TABLE_NAME, NEW.id, NEW.pessoa_id, usuario, ocorrido, conteudo));
  END IF;

  PERFORM audit.gravar_evento(audit.novo_evento(
    linha.casa_id, TG_OP, TG_TABLE_NAME, linha.id, linha.pessoa_id, usuario, ocorrido, conteudo));

  RETURN NULL;
END
$$;

-- ---------------------------------------------------------------------
-- parcelas (a Casa e o responsável vêm da compra)
-- ---------------------------------------------------------------------
-- Quando uma compra é apagada de vez, as parcelas vão junto em cascata, e
-- o trigger da parcela já não encontra a compra. Este trigger, antes da
-- exclusão da compra, guarda Casa, responsável e quem lançou numa
-- variável local da transação, que o trigger da parcela consulta.
CREATE FUNCTION audit.guardar_contexto_compra() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM set_config(
    'audit.compra_' || OLD.id,
    OLD.casa_id || ':' || OLD.pessoa_id || ':' || coalesce(OLD.lancado_por_id::text, ''),
    true);
  RETURN OLD;
END
$$;

CREATE FUNCTION audit.registrar_parcela() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  linha     record;
  compra_id integer;
  casa      integer;
  pessoa    integer;
  lancador  integer;
  guardado  text[];
  usuario   integer := audit.usuario_da_sessao();
  conteudo  jsonb;
  ocorrido  timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'DELETE' THEN
    linha := OLD;
    conteudo := audit.conteudo(TG_OP, to_jsonb(OLD), NULL);
  ELSE
    linha := NEW;
    conteudo := audit.conteudo(TG_OP, CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW));
  END IF;
  compra_id := linha.compra_id;

  SELECT c.casa_id, c.pessoa_id, c.lancado_por_id INTO casa, pessoa, lancador
    FROM public.compras c WHERE c.id = compra_id;
  IF NOT FOUND THEN
    guardado := string_to_array(current_setting('audit.compra_' || compra_id, true), ':');
    IF guardado IS NULL THEN
      RAISE EXCEPTION 'auditoria: parcela % sem a compra % (nem contexto guardado)', linha.id, compra_id;
    END IF;
    casa     := guardado[1]::integer;
    pessoa   := guardado[2]::integer;
    lancador := nullif(guardado[3], '')::integer;
  END IF;

  IF TG_OP = 'INSERT' THEN
    usuario := coalesce(usuario, lancador);
  END IF;
  usuario := audit.exigir_usuario(usuario, TG_TABLE_NAME, TG_OP);

  PERFORM audit.gravar_evento(audit.novo_evento(
    casa, TG_OP, TG_TABLE_NAME, linha.id, pessoa, usuario, ocorrido, conteudo));

  RETURN NULL;
END
$$;

-- ---------------------------------------------------------------------
-- Ligação nas tabelas
-- ---------------------------------------------------------------------
CREATE TRIGGER auditoria_compras
  AFTER INSERT OR UPDATE OR DELETE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION audit.registrar_lancamento();

CREATE TRIGGER auditoria_receitas
  AFTER INSERT OR UPDATE OR DELETE ON public.receitas
  FOR EACH ROW EXECUTE FUNCTION audit.registrar_lancamento();

CREATE TRIGGER auditoria_parcelas
  AFTER INSERT OR UPDATE OR DELETE ON public.parcelas
  FOR EACH ROW EXECUTE FUNCTION audit.registrar_parcela();

CREATE TRIGGER auditoria_compras_contexto
  BEFORE DELETE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION audit.guardar_contexto_compra();
