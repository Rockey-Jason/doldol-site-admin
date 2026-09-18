import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { token } = await req.json();
    const value = String(token ?? "").trim();
    if (!value) {
      return new Response(JSON.stringify({ message: "인증 토큰이 없습니다." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: row, error } = await admin
      .from("admin_verification_tokens")
      .select("id,user_id,expires_at,used")
      .eq("token", value)
      .maybeSingle();

    if (error || !row) {
      return new Response(JSON.stringify({ message: "유효하지 않은 인증 링크입니다." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    if (row.used || new Date(row.expires_at).getTime() <= Date.now()) {
      return new Response(JSON.stringify({ message: "인증 링크가 만료되었거나 이미 사용되었습니다." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const { data: profile } = await admin
      .from("users")
      .select("is_admin,user_level")
      .eq("user_id", String(row.user_id))
      .maybeSingle();

    if (!profile?.is_admin || Number(profile.user_level ?? 0) < 10) {
      return new Response(JSON.stringify({ message: "관리자 권한이 없습니다." }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const { error: consumeError } = await admin
      .from("admin_verification_tokens")
      .update({ used: true })
      .eq("id", row.id)
      .eq("used", false);

    if (consumeError) throw consumeError;

    return new Response(JSON.stringify({ ok: true, verified: true }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ message: "이메일 인증 처리 중 오류가 발생했습니다." }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
