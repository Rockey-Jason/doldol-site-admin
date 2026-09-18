import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ message: "로그인이 필요합니다." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ message: "유효한 로그인 세션이 아닙니다." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await admin
      .from("users")
      .select("user_id,login_id,name,is_admin,user_level")
      .eq("user_id", String(user.id))
      .maybeSingle();

    if (!profile?.is_admin || Number(profile.user_level ?? 0) < 10) {
      return new Response(JSON.stringify({ message: "관리자 권한이 없습니다." }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await admin
      .from("admin_verification_tokens")
      .insert({
        user_id: user.id,
        token,
        expires_at: expires,
        used: false
      });

    if (insertError) throw insertError;

    const siteUrl = Deno.env.get("ADMIN_SITE_URL");
    if (!siteUrl) throw new Error("ADMIN_SITE_URL is not configured");

    const link = `${siteUrl.replace(/\/$/, "")}?admin_token=${encodeURIComponent(token)}`;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const to = Deno.env.get("ADMIN_VERIFY_EMAIL") ?? "jason.yeonwoo.im@gmail.com";
    const from = Deno.env.get("VERIFY_FROM_EMAIL") ?? "onboarding@resend.dev";

    if (!resendKey) throw new Error("RESEND_API_KEY is not configured");

    const resend = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "돌이 관리자 센터 이메일 인증",
        html: `
          <h2>돌이 관리자 센터</h2>
          <p>관리자 로그인 인증 요청이 발생했습니다.</p>
          <p><a href="${link}">이메일 인증 완료</a></p>
          <p>이 링크는 10분 후 만료됩니다.</p>
        `
      })
    });

    if (!resend.ok) {
      const detail = await resend.text();
      console.error(detail);
      return new Response(JSON.stringify({ message: "인증 이메일 발송에 실패했습니다." }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ message: "인증 메일 처리 중 오류가 발생했습니다." }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
