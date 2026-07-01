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
  if (redirectTo) body.redirect_to = redirectTo;
  if (data) body.data = data;

  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/invite`, {
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
