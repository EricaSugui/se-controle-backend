-- Condição A: log convencional (decisão 5).
--
-- Usa a tabela audit.eventos de 10-audit-comum.sql com as constraints do
-- schema (NOT NULL, FK e CHECK), sem encadeamento: `indice`,
-- `hash_anterior` e `hash` ficam nulos. Sem verificação histórica.
--
-- Os triggers nas tabelas auditadas entram no bloco 2 do roteiro.

-- Garante que nenhum evento de A tenha campos de encadeamento.
ALTER TABLE audit.eventos
  ADD CONSTRAINT eventos_condicao_a_sem_cadeia
  CHECK (indice IS NULL AND hash_anterior IS NULL AND hash IS NULL);
