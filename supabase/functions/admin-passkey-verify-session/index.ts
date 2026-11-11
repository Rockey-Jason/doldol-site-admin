import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://rockey-jason.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}

function readSessionClaims(token: string): { sessionId: string; amr: Array<{ method?: string; timestamp?: number }> } {
  const parts = token.split(".");
  if (parts.length !== 3) return { sessionId: "", amr: [] };
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const decoded = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
  return {
    sessionId: typeof decoded.session_id === "string" ? decoded.session_id : "",
    amr: Array.isArray(decoded.amr) ? decoded.amr : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "요청을 처리할 수 없습니다." }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ ok: false, message: "패스키 로그인이 필요합니다." }, 401);
    }

    const accessToken = authorization.slice(7).trim();
    if (!accessToken || accessToken.length > 8192) return json({ ok: false, message: "로그인 세션을 확인할 수 없습니다." }, 401);

    const { sessionId, amr } = readSessionClaims(accessToken);
    if (!sessionId || sessionId.length > 100) return json({ ok: false, message: "인증 세션을 확인할 수 없습니다." }, 401);

    // Do not let a regular password session call this endpoint to bypass the
    // existing second-step administrator email verification.
    const latestMethod = amr[0];
    const methodTimestamp = Number(latestMethod?.timestamp || 0);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      latestMethod?.method !== "passkey" ||
      !Number.isFinite(methodTimestamp) ||
      methodTimestamp <= 0 ||
      methodTimestamp > nowSeconds + 60 ||
      nowSeconds - methodTimestamp > 300
    ) {
      return json({ ok: false, message: "최근 5분 이내에 패스키로 인증한 세션만 관리자 인증에 사용할 수 있습니다." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("admin-passkey-verify-session missing server configuration");
      return json({ ok: false, message: "관리자 인증 서비스를 일시적으로 사용할 수 없습니다." }, 503);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Validate the exact bearer token received by this request, without relying
    // on a stored session or a custom global header.
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData?.user) return json({ ok: false, message: "유효한 로그인 세션이 아닙니다." }, 401);

    const userId = authData.user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("user_id,is_admin,user_level")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("admin-passkey profile lookup failed:", profileError.code);
      return json({ ok: false, message: "관리자 권한을 확인하지 못했습니다." }, 503);
    }
    if (!profile || profile.is_admin !== true || Number(profile.user_level ?? 0) < 10) {
      return json({ ok: false, message: "관리자 계정만 패스키로 관리자 센터에 로그인할 수 있습니다." }, 403);
    }

    // Record only hashed identifiers and throttle verified admin-session creation.
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || forwarded || "unknown";
    const ipHash = await sha256(ip);
    const loginHash = await sha256("admin-passkey:" + userId);
    const { error: cleanupError } = await admin.from("admin_login_attempts")
      .delete().lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (cleanupError) {
      console.error("admin passkey rate-limit cleanup failed:", cleanupError.code);
      return json({ ok: false, message: "관리자 인증 요청을 처리하지 못했습니다." }, 503);
    }
    const { error: insertError } = await admin.from("admin_login_attempts").insert({
      ip_hash: ipHash,
      login_hash: loginHash,
    });
    if (insertError) {
      console.error("admin passkey rate-limit insert failed:", insertError.code);
      return json({ ok: false, message: "관리자 인증 요청을 처리하지 못했습니다." }, 503);
    }

    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const [{ count: ipCount, error: ipError }, { count: userCount, error: userError }] = await Promise.all([
      admin.from("admin_login_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", cutoff),
      admin.from("admin_login_attempts").select("id", { count: "exact", head: true }).eq("login_hash", loginHash).gte("created_at", cutoff),
    ]);
    if (ipError || userError) {
      console.error("admin passkey rate-limit lookup failed");
      return json({ ok: false, message: "관리자 인증 요청을 처리하지 못했습니다." }, 503);
    }
    if ((ipCount ?? 0) > 10 || (userCount ?? 0) > 10) {
      return json({ ok: false, message: "로그인 요청이 너무 많습니다. 15분 후 다시 시도해 주세요." }, 429);
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error: sessionError } = await admin.from("admin_verification_sessions").upsert({
      user_id: userId,
      session_id: sessionId,
      expires_at: expiresAt,
    }, { onConflict: "user_id,session_id" });

    if (sessionError) {
      console.error("admin passkey session persistence failed:", sessionError.code);
      return json({ ok: false, message: "관리자 인증 세션을 만들지 못했습니다." }, 503);
    }

    return json({ ok: true, verified: true, expires_in: 1800 });
  } catch (error) {
    console.error("admin-passkey-verify-session failed:", error instanceof Error ? error.name : "unknown");
    return json({ ok: false, message: "패스키 관리자 로그인을 처리하지 못했습니다." }, 400);
  }
});