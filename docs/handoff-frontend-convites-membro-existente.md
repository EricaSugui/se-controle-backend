# Handoff frontend — aceite de convite no dashboard

> Backend entregue em 2026-08-12. Consulte também `docs/visao-dominio.md`.

## Objetivo

Permitir que uma pessoa **já autenticada e vinculada ao sistema** aceite, pelo
dashboard, um convite enviado ao seu próprio email. O dashboard não usa nem
recebe o token público do convite.

O fluxo do link recebido por email continua existindo como fallback, em especial
para onboarding: ele usa `PATCH /convites/token/:token/aceitar`. Não o use para
o CTA do dashboard.

## Contrato do dashboard

### Listar convites recebidos

`GET /convites/recebidos`

- enviar o Bearer token da sessão do Supabase;
- retorna somente convites com `status: "pendente"` cujo `email` corresponde ao
  email da pessoa autenticada;
- retorna uma lista vazia quando não houver convites;
- os resultados vêm do mais recente para o mais antigo;
- nenhum item expõe `token`.

Exemplo de resposta:

```json
[
  {
    "id": 12,
    "email": "erica@email.com",
    "convidado_por_id": 7,
    "casa_id": 2,
    "papel": "membro",
    "status": "pendente",
    "expires_at": "2026-08-20T23:59:59Z",
    "created_at": "2026-08-12T10:15:00Z"
  }
]
```

Campos úteis para a tela:

- `id`: use exclusivamente para o aceite autenticado;
- `casa_id`: identifica a casa convidante, quando houver;
- `papel`: `admin` ou `membro`;
- `expires_at`: opcional. Se estiver no passado, desabilite o CTA e solicite
  uma atualização da lista;
- `status`: os itens desta lista devem ser `pendente`.

O contrato atual não inclui o nome da casa. Caso a UI não consiga resolver esse
nome com dados já carregados, apresente uma mensagem genérica, por exemplo
“Você recebeu um convite para participar de uma casa”.

### Aceitar o convite

`PATCH /convites/recebidos/:id/aceitar`

- enviar o Bearer token da sessão do Supabase;
- não enviar corpo e não usar token do convite;
- usar o `id` retornado por `GET /convites/recebidos`;
- o backend confere que o email do convite pertence à pessoa autenticada;
- quando há `casa_id`, cria a associação da pessoa à casa com o `papel` do
  convite e marca o convite como aceito, na mesma transação;
- quando não há `casa_id`, apenas marca o convite como aceito.

```http
PATCH /convites/recebidos/12/aceitar
Authorization: Bearer <supabase_access_token>
```

Em caso de sucesso (`200`), a resposta é o convite atualizado, sem o campo
`token`, com `status: "aceito"`.

## Estados e erros

Enquanto um aceite estiver em andamento, desabilite o botão daquele item para
evitar clique duplo. Depois de um `200`, remova o convite da lista local e
recarregue/invalide os dados dependentes de participação em casa, inclusive o
dashboard e o contexto de grupo, se aplicável.

| Status | Significado | Comportamento sugerido |
| --- | --- | --- |
| `200` | Convite aceito | Atualizar a lista e os dados da casa. |
| `401` | Sessão ausente, inválida ou expirada | Renovar sessão ou redirecionar ao login. |
| `403` | O convite pertence a outro email, ou a conta não possui email vinculado | Mostrar que o convite foi enviado para outra conta. |
| `404` | Convite não existe mais | Remover o item local e atualizar a lista. |
| `409` | Convite expirado/já utilizado, ou a pessoa já está associada à casa | Remover ou desabilitar o item e atualizar a lista; atualizar dados da casa se a associação já existir. |

## Integração recomendada

Conforme a arquitetura do app, concentre as chamadas em `src/services/api/` e
não as faça diretamente no componente. Um hook, como `useConvitesRecebidos`,
pode encapsular carregamento, aceite, estado de envio e atualização após o
sucesso.

No dashboard:

1. Buscar `GET /convites/recebidos` ao carregar a tela autenticada.
2. Quando a lista não estiver vazia, mostrar uma seção “Convites pendentes”
   acima ou próxima dos cards principais.
3. Para cada item, exibir um CTA “Aceitar convite” ligado ao respectivo `id`.
4. Chamar `PATCH /convites/recebidos/:id/aceitar` ao confirmar a ação.
5. Após sucesso, atualizar a lista e recarregar o estado da casa/dashboard.

Não há uma ação separada de “entrar na casa”: aceitar o convite é a operação
que realiza a entrada. A associação direta (`POST /casas/:casaId/pessoas`)
continua sendo uma operação administrativa e não deve ser usada nesse fluxo.

## Checklist

- [ ] Serviço de API para listar convites recebidos com a sessão atual.
- [ ] Serviço de API para aceitar por `id`, sem token público e sem body.
- [ ] Seção condicional no dashboard para convites pendentes.
- [ ] Estado de carregamento e proteção contra clique duplo.
- [ ] Tratamento específico para `401`, `403`, `404` e `409`.
- [ ] Invalidação/recarga do dashboard e do contexto de grupo após `200`.

