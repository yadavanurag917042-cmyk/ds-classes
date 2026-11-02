import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function normalizeIndianMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

async function phoneRateLimitKey(phone: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(phone));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid login request." }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonResponse({ error: "Invalid login request." }, 400);
  }

  const credentials = body as Record<string, unknown>;
  const phone = normalizeIndianMobile(credentials.phone);
  const password = credentials.password;
  const purpose = credentials.purpose;
  if (!phone || typeof password !== "string" || password.length < 1 || password.length > 128 ||
    (purpose !== "student" && purpose !== "admin")) {
    return jsonResponse({ error: "Invalid login request." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rateLimitSecret = Deno.env.get("PHONE_LOGIN_RATE_LIMIT_SECRET");
  if (!url || !anonKey || !serviceRoleKey || !rateLimitSecret) {
    console.error("Phone login function is missing Supabase server configuration.");
    return jsonResponse({ error: "Login service is not configured." }, 500);
  }

  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const phoneHash = await phoneRateLimitKey(phone, rateLimitSecret);
    const { data: allowed, error: rateLimitError } = await serviceClient.rpc("check_phone_login_rate_limit", {
      p_phone_hash: phoneHash,
      p_action: "check",
    });
    if (rateLimitError) throw new Error("Phone login rate limiter failed.");
    if (allowed !== true) {
      return jsonResponse({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    }

    const recordFailure = async () => {
      const { error } = await serviceClient.rpc("check_phone_login_rate_limit", {
        p_phone_hash: phoneHash,
        p_action: "failure",
      });
      if (error) throw new Error("Phone login rate limiter failed.");
    };
    const invalidCredentials = async () => {
      await recordFailure();
      return jsonResponse({ error: "Invalid phone or password." }, 401);
    };

    const phoneVariants = [phone, `91${phone}`, `+91${phone}`];
    const { data: profiles, error: profileError } = await serviceClient
      .from("profiles")
      .select("id,is_active")
      .in("phone", phoneVariants)
      .limit(2);
    if (profileError) throw new Error("Phone lookup failed.");
    if (!profiles || profiles.length !== 1) {
      return await invalidCredentials();
    }
    if (profiles[0].is_active === false) {
      return await invalidCredentials();
    }

    const { data: userResult, error: userError } = await serviceClient.auth.admin.getUserById(profiles[0].id);
    if (userError) throw new Error("User lookup failed.");
    const user = userResult.user;
    if (!user?.email || !user.email_confirmed_at) {
      return await invalidCredentials();
    }
    if (purpose === "admin" && user.app_metadata?.role !== "admin") {
      return await invalidCredentials();
    }

    const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (signInError || !signIn.session || !signIn.user) {
      return await invalidCredentials();
    }
    if (purpose === "admin" && signIn.user.app_metadata?.role !== "admin") {
      await authClient.auth.signOut();
      return await invalidCredentials();
    }

    const { error: clearLimitError } = await serviceClient.rpc("check_phone_login_rate_limit", {
      p_phone_hash: phoneHash,
      p_action: "success",
    });
    if (clearLimitError) throw new Error("Phone login rate limiter failed.");
    return jsonResponse({ session: signIn.session });
  } catch (error) {
    console.error("Phone login request failed:", error instanceof Error ? error.message : "Unknown server error.");
    return jsonResponse({ error: "Login service could not complete the request." }, 500);
  }
});
