async function getSupabaseUser(token) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function inviteSupabaseUser(email, redirectTo) {
  const body = { email };
  if (redirectTo) body.redirect_to = redirectTo;

  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.msg || err.message || 'Erro ao enviar convite pelo Supabase');
  }

  return response.json();
}

module.exports = { getSupabaseUser, inviteSupabaseUser };
