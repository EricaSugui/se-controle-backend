-- Condição A: log convencional (decisão 5).
--
-- Usa a tabela audit.eventos de 10-audit-comum.sql com as constraints do
-- schema (NOT NULL, FK e CHECK), sem encadeamento: `indice`,
-- `hash_anterior` e `hash` ficam nulos. Sem verificação histórica.
--
-- Os triggers (30-triggers.sql) são os mesmos nas duas condições; só a
-- função audit.gravar_evento muda.

-- Garante que nenhum evento de A tenha campos de encadeamento.
ALTER TABLE audit.eventos
  ADD CONSTRAINT eventos_condicao_a_sem_cadeia
  CHECK (indice IS NULL AND hash_anterior IS NULL AND hash IS NULL);

-- Grava o evento montado pelo trigger, sem nada além.
CREATE FUNCTION audit.gravar_evento(e audit.eventos) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  INSERT INTO audit.eventos
    (casa_id, operacao, entidade, entidade_id, pessoa_responsavel_id,
     usuario_registrador_id, ocorrido_em, conteudo)
  VALUES
    (e.casa_id, e.operacao, e.entidade, e.entidade_id, e.pessoa_responsavel_id,
     e.usuario_registrador_id, e.ocorrido_em, e.conteudo);
END
$$;
