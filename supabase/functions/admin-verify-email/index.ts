import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json({ message: "POST 요청만 허용됩니다." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return json({ message: "로그인이 필요합니다." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();

    if (!token || token.length > 200) {
      return json({ message: "유효하지 않은 인증 링크입니다." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Supabase configuration is missing.");
      return json({ message: "서버 인증 설정 오류입니다." }, 500);
    }

    // The email link is only valid in the same authenticated browser session.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ message: "유효한 로그인 세션이 아닙니다." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("user_id,is_admin,user_level")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed:", profileError);
      return json({ message: "관리자 권한을 확인하는 중 오류가 발생했습니다." }, 500);
    }

    if (
      !profile?.is_admin ||
      Number(profile.user_level ?? 0) < 10
    ) {
      return json({ message: "관리자 권한이 없습니다." }, 403);
    }

    // The token must belong to the currently authenticated administrator.
    const { data: row, error: tokenError } = await admin
      .from("admin_verification_tokens")
      .select("id,user_id,expires_at,used")
      .eq("token", token)
      .eq("user_id", user.id)
      .maybeSingle();

    if (tokenError) {
      console.error("Token lookup failed:", tokenError);
      return json({ message: "인증 링크를 확인하는 중 오류가 발생했습니다." }, 500);
    }

    if (!row) {
      return json({ message: "유효하지 않은 인증 링크입니다." }, 400);
    }

    if (row.used) {
      return json({ message: "이미 사용된 인증 링크입니다." }, 400);
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return json({ message: "인증 링크가 만료되었습니다. 다시 로그인해 주세요." }, 400);
    }

    // Atomic consumption: only an unused token belonging to this user can be consumed.
    const { data: consumed, error: consumeError } = await admin
      .from("admin_verification_tokens")
      .update({ used: true })
      .eq("id", row.id)
      .eq("user_id", user.id)
      .eq("used", false)
      .select("id")
      .maybeSingle();

    if (consumeError) {
      console.error("Token consume failed:", consumeError);
      return json({ message: "인증 상태를 저장하지 못했습니다." }, 500);
    }

    if (!consumed) {
      return json({ message: "인증 링크가 이미 사용되었습니다." }, 400);
    }

    return json({
      ok: true,
      verified: true,
    });
  } catch (error) {
    console.error("admin-verify-email error:", error);
    return json({ message: "이메일 인증 처리 중 오류가 발생했습니다." }, 500);
  }
});
