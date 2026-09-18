// Supabase Edge Function: admin-request-verification
// 목적: 이미 로그인한 관리자 세션을 확인한 후 관리자 인증 메일 발송.
// RESEND_API_KEY, ADMIN_VERIFY_EMAIL 환경변수를 설정하세요.
// 비밀번호는 절대로 받거나 이메일로 보내지 않습니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile } = await admin.from("users")
      .select("user_id,login_id,name,is_admin,user_level")
      .eq("user_id", user.id).single();

    if (!profile?.is_admin || Number(profile.user_level ?? 0) < 10)
      return new Response("Forbidden", { status: 403 });

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await admin.from("admin_verification_tokens").insert({
      user_id: user.id, token, expires_at: expires, used: false
    });

    const base = Deno.env.get("ADMIN_SITE_URL")!;
    const link = `${base}?admin_token=${encodeURIComponent(token)}`;

    const resend = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: Deno.env.get("VERIFY_FROM_EMAIL") ?? "onboarding@resend.dev",
        to: [Deno.env.get("ADMIN_VERIFY_EMAIL") ?? "jason.yeonwoo.im@gmail.com"],
        subject: "돌이 관리자 인증",
        html: `<h2>돌이 관리자 인증</h2><p>관리자 인증 요청이 발생했습니다.</p><p><a href="${link}">관리자 인증 완료</a></p><p>10분 후 만료됩니다.</p>`
      })
    });
    if (!resend.ok) return new Response("Email send failed", { status: 502 });
    return new Response(JSON.stringify({ ok:true }), {headers:{"Content-Type":"application/json"}});
  } catch (e) {
    return new Response(String(e), {status:500});
  }
});