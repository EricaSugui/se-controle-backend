# Convites

Convites levam alguém para dentro de uma casa. O backend escolhe o fluxo
sozinho, a partir do e-mail informado em `POST /convites`: **o front não
decide o tipo**.

Código: [src/routes/convites.ts](../src/routes/convites.ts). Contrato:
[openapi/resources/convites.yml](../openapi/resources/convites.yml).
Migration: `1785100000000_add-tipo-e-destinatario-a-convites.js` (colunas
`convites.tipo` e `convites.destinatario_pessoa_id`).

## Dois tipos de convite

A existência de conta é verificada **no Supabase Auth**
(`findSupabaseUserByEmail`, paginado por `/auth/v1/admin/users`), e não pelo
`pessoas.supabase_user_id` local. O vínculo local serve só para localizar a
pessoa do domínio. Por isso o `POST /convites` exige
`SUPABASE_SERVICE_ROLE_KEY` mesmo quando nenhum e-mail é enviado.

| | `interno` | `email` |
|---|---|---|
| Quando | O e-mail já tem conta no Supabase Auth | O e-mail não tem conta |
| `casa_id` | Obrigatório (sem casa → 400) | Opcional (sem casa = auto-cadastro) |
| Envio | Nenhum e-mail. A pessoa vê em `GET /convites/recebidos` | `inviteSupabaseUser`, com redirect `FRONTEND_URL/convidado?token=…` |
| `destinatario_pessoa_id` | Sempre preenchido (pessoa existente ou criada na hora) | Preenchido se já existir pessoa local com o e-mail, senão nulo |
| Aceite | `PATCH /convites/recebidos/:id/aceitar` (autenticado) | `PATCH /convites/token/:token/aceitar` (Bearer do Supabase) |
| Resposta do POST | `201` com `tipo: "interno"` e `interno: true` | `201` com `tipo: "email"` |

O `token` é gerado para os dois tipos, mas nunca sai nas respostas
autenticadas. `GET /convites/token/:token` e o aceite por token só
encontram convites `tipo = 'email'`. Um convite interno não é resolvido por
token.

## Criação (`POST /convites`)

Validações, na ordem em que acontecem:

1. `email` obrigatório. É normalizado com trim e lowercase.
2. `papel`, se informado, é `admin` ou `membro`.
3. Com `casa_id`, o usuário precisa ser admin da casa (403).
4. Mais de uma pessoa local com o mesmo e-mail dá **409**. Os cadastros
   precisam ser revisados antes.
5. Convidar a si mesmo dá **400**.
6. A pessoa local tem `supabase_user_id` diferente da conta encontrada no
   Auth (ou a conta não existe mais): **409**.
7. A conta existe, mas não há `casa_id`: **400**. Conta existente só é
   convidada pela área de membros de uma casa.
8. O e-mail aponta para uma pessoa e a conta do Auth está vinculada a outra
   pessoa: **409**.
9. A pessoa já participa da casa: **409**.
10. Já existe um convite interno pendente e válido para a pessoa na casa:
    **409**.

No fluxo interno, a transação também garante a pessoa destinatária:

- se já existe pessoa local (sem login ou com o mesmo login), ela é
  vinculada à conta (`supabase_user_id`);
- se não existe, uma pessoa é criada com o nome dos metadados do Auth
  (`full_name`, `name` ou `display_name`). Sem metadados, usa o e-mail.

No fluxo por e-mail, se o Supabase falhar ao enviar o convite, o registro é
apagado e o erro propaga.

## Nome da pessoa criada

Ao criar uma pessoa (no convite interno ou no aceite por token),
`nomePessoaDisponivel`:

- corta o nome em 100 caracteres, o tamanho de `pessoas.nome`;
- se o nome já existir, acrescenta ` (<8 primeiros chars do user id>)`,
  cortando o nome para que o total continue em 100.

## Convites recebidos

`GET /convites/recebidos` lista os convites pendentes e não expirados da
pessoa autenticada, com `casa_nome` e `convidado_por_nome`. Um convite entra
na lista quando:

- `destinatario_pessoa_id` é a pessoa autenticada e o tipo é `interno`, **ou**
- `destinatario_pessoa_id` é nulo e o e-mail do convite bate com o e-mail da
  pessoa (sem diferenciar maiúsculas). Isso cobre convites por e-mail
  antigos ou feitos antes da pessoa ter cadastro.

Convites por e-mail com destinatário já definido não aparecem aqui: eles
seguem pelo token.

`PATCH /convites/recebidos/:id/aceitar` aplica o mesmo filtro com `FOR
UPDATE`, insere em `casa_pessoas` com o papel do convite (padrão `membro`,
idempotente) e marca o convite como `aceito`. Retorna 404 se o convite não
for visível para a pessoa e 400 se ele não tiver casa.

## Aceite por token (`PATCH /convites/token/:token/aceitar`)

Exige o Bearer do Supabase (não o middleware `autenticar`, porque a pessoa
pode ainda não existir). Em uma transação:

1. Convite precisa estar `pendente` e não expirado (**409**). O e-mail da
   conta precisa bater com o do convite (**403**).
2. Se a conta já tem pessoa e o convite aponta para outra
   (`destinatario_pessoa_id`): **409**.
3. Se a conta ainda não tem pessoa, procura a pessoa alvo: o
   `destinatario_pessoa_id`, ou então a pessoa com o mesmo e-mail (mais de
   uma dá **409**). Se o alvo já tem outro login: **409**.
4. Com alvo, vincula `supabase_user_id` e e-mail, preservando o histórico.
   Sem alvo, cria a pessoa com `body.nome` ou, na falta dele, o e-mail (ver
   regra de nome acima).
5. Entra na casa, se houver `casa_id`.
6. Marca `onboarding_pessoas.perfil = 'convidado'`.
7. Marca o convite como `aceito` e retorna a pessoa.

## Rotas administrativas

`PATCH /convites/:id/aceitar` e `PATCH /convites/:id/expirar` só mudam o
status, sem criar pessoa nem vínculo. Podem usá-las o admin da casa do
convite ou, em convites sem casa, quem os criou. Não existe DELETE (ver
[decisoes-superficie-api.md](decisoes-superficie-api.md)).
