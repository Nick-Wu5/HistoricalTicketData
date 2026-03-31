const jsonHeaders = { "Content-Type": "application/json" };

/**
 * Verify a user JWT by calling the Supabase Auth server directly.
 * Works with both publishable keys and legacy anon keys.
 *
 * Use inside Edge Functions deployed with verify_jwt = false
 * to replace gateway-level JWT verification.
 */
export async function requireAuth(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Promise<{ authorized: true; userId: string } | { authorized: false; response: Response }> {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...jsonHeaders, ...corsHeaders } },
      ),
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseApiKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    "";

  if (!supabaseUrl || !supabaseApiKey) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Server auth misconfiguration" }),
        { status: 500, headers: { ...jsonHeaders, ...corsHeaders } },
      ),
    };
  }

  const authCheck = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
    {
      method: "GET",
      headers: { apikey: supabaseApiKey, authorization },
    },
  );

  if (!authCheck.ok) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Invalid or expired JWT" }),
        { status: 401, headers: { ...jsonHeaders, ...corsHeaders } },
      ),
    };
  }

  const user = await authCheck.json().catch(() => null);
  return { authorized: true, userId: user?.id ?? "" };
}
