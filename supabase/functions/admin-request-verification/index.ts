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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Supabase configuration is missing.");
      return json({ message: "서버 인증 설정 오류입니다." }, 500);
    }

    // Verify the caller's JWT. Do not trust a user_id supplied by the browser.
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
      console.error("JWT verification failed:", userError);
      return json({ message: "유효한 로그인 세션이 아닙니다." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("user_id,login_id,name,is_admin,user_level")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Admin profile lookup failed:", profileError);
      return json({ message: "관리자 권한을 확인하는 중 오류가 발생했습니다." }, 500);
    }

    if (
      !profile?.is_admin ||
      Number(profile.user_level ?? 0) < 10
    ) {
      return json({ message: "관리자 권한이 없습니다." }, 403);
    }

    // Invalidate all previous unused tokens for this administrator.
    const { error: invalidateError } = await admin
      .from("admin_verification_tokens")
      .update({ used: true })
      .eq("user_id", user.id)
      .eq("used", false);

    if (invalidateError) {
      console.error("Old token invalidation failed:", invalidateError);
      return json({ message: "기존 인증 요청을 정리하지 못했습니다." }, 500);
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await admin
      .from("admin_verification_tokens")
      .insert({
        user_id: user.id,
        token,
        expires_at: expiresAt,
        used: false,
      });

    if (insertError) {
      console.error("Token insert failed:", insertError);
      return json({ message: "인증 요청을 생성하지 못했습니다." }, 500);
    }

    const siteUrl = Deno.env.get("ADMIN_SITE_URL");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const to = Deno.env.get("ADMIN_VERIFY_EMAIL") || "jason.yeonwoo.im@gmail.com";
    const from = Deno.env.get("VERIFY_FROM_EMAIL");

    if (!siteUrl || !resendKey || !from) {
      console.error("Email configuration is missing.");
      // Remove the unusable token so it cannot linger.
      await admin
        .from("admin_verification_tokens")
        .delete()
        .eq("token", token);
      return json({ message: "관리자 이메일 서비스 설정이 완료되지 않았습니다." }, 500);
    }

    const url = new URL(siteUrl);
    url.searchParams.set("admin_token", token);
    const link = url.toString();

    const resend = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "돌이 관리자 센터 이메일 인증",
        html: `
<!doctype html>
<html lang="ko">
  <body style="margin:0;background:#020817;color:#edf4ff;font-family:Arial,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:48px 24px;">
      <div style="background:#07122b;border:1px solid #24365c;border-radius:24px;padding:34px;">
        <div style="font-size:42px;">🐶</div>
        <h1 style="margin:14px 0 8px;color:#fff;">돌이 관리자 센터</h1>
        <p style="color:#aab9d2;line-height:1.7;">
          관리자 로그인 인증 요청이 발생했습니다.
        </p>
        <a href="${link}"
           style="display:inline-block;margin:20px 0;padding:14px 22px;
                  background:#2478ff;color:#fff;text-decoration:none;
                  border-radius:12px;font-weight:700;">
          관리자 인증 완료
        </a>
        <p style="color:#8292ae;font-size:14px;line-height:1.7;">
          이 인증 링크는 10분 후 만료됩니다.<br>
          본인이 요청하지 않았다면 이 메일을 무시하세요.
        </p>
      </div>
    </div>
  </body>
</html>
        `,
      }),
    });

    if (!resend.ok) {
      const detail = await resend.text();
      console.error("Resend error:", detail);

      await admin
        .from("admin_verification_tokens")
        .delete()
        .eq("token", token);

      return json({ message: "인증 이메일 발송에 실패했습니다." }, 502);
    }

    return json({
      ok: true,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("admin-request-verification error:", error);
    return json({ message: "인증 메일 처리 중 오류가 발생했습니다." }, 500);
  }
});
