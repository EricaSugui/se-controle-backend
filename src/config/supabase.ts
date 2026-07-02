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
