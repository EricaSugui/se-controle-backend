export async function getSupabaseUser(token: string): Promise<{ id: string; email: string } | null> {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_ANON_KEY as string,
    },
  });

  if (!response.ok) return null;

  return response.json() as Promise<{ id: string; email: string }>;
}

export async function inviteSupabaseUser(email: string, redirectTo?: string, data?: Record<string, string>): Promise<void> {
  const body: Record<string, unknown> = { email };
  if (data) body.data = data;

  // GoTrue só lê o redirect do endpoint /invite via query string — um
  // redirect_to no corpo JSON é ignorado e ele cai no Site URL padrão.
  const url = new URL(`${process.env.SUPABASE_URL}/auth/v1/invite`);
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json() as { msg?: string; message?: string };
    throw new Error(err.msg || err.message || 'Erro ao enviar convite pelo Supabase');
  }
}


export async function findSupabaseUserByEmail(email: string): Promise<{ id: string; email: string; nome?: string } | null> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const baseUrl = process.env.SUPABASE_URL;
  if (!serviceRoleKey || !baseUrl) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários para consultar usuários');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const url = new URL(`${baseUrl}/auth/v1/admin/users`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { msg?: string; message?: string };
      throw new Error(err.msg || err.message || 'Erro ao consultar usuários do Supabase');
    }

    const payload = await response.json() as { users?: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }> };
    const users = payload.users ?? [];
    const found = users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
    if (found?.email) {
      const metadata = found.user_metadata ?? {};
      const nome = [metadata.full_name, metadata.name, metadata.display_name]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      return { id: found.id, email: found.email, nome: nome?.trim() };
    }
    if (users.length < perPage) return null;
  }

}
