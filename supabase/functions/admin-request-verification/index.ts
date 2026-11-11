import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://rockey-jason.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type":
    "application/json; charset=utf-8",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  // --------------------------------------------------
  // CORS
  // --------------------------------------------------
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        ok: false,
        message: "POST 요청만 허용됩니다.",
      },
      405
    );
  }

  try {
    // --------------------------------------------------
    // 환경변수
    // --------------------------------------------------
    const SUPABASE_URL =
      Deno.env.get("SUPABASE_URL") || "";

    const SUPABASE_ANON_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") || "";

    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const VERIFY_FROM_EMAIL = Deno.env.get("VERIFY_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL") || "";
    const ADMIN_VERIFY_EMAIL = Deno.env.get("ADMIN_VERIFY_EMAIL") || "";

    const ADMIN_SITE_URL =
      Deno.env.get("ADMIN_SITE_URL") || "";

    // --------------------------------------------------
    // 환경변수 검사
    // --------------------------------------------------
    if (!SUPABASE_URL) {
      console.error("Missing SUPABASE_URL");
      return json(
        {
          ok: false,
          message: "SUPABASE_URL 환경변수가 없습니다.",
        },
        500
      );
    }

    if (!SUPABASE_ANON_KEY) {
      console.error("Missing SUPABASE_ANON_KEY");
      return json(
        {
          ok: false,
          message: "SUPABASE_ANON_KEY 환경변수가 없습니다.",
        },
        500
      );
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      return json(
        {
          ok: false,
          message: "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
        },
        500
      );
    }

    if (!RESEND_API_KEY || !VERIFY_FROM_EMAIL) {
      console.error("Missing Resend email configuration");
      return json({ ok: false, message: "이메일 발송 설정이 완료되지 않았습니다." }, 500);
    }

    if (!ADMIN_VERIFY_EMAIL) {
      console.error("Missing ADMIN_VERIFY_EMAIL");
      return json(
        {
          ok: false,
          message: "ADMIN_VERIFY_EMAIL 환경변수가 없습니다.",
        },
        500
      );
    }

    if (!ADMIN_SITE_URL) {
      console.error("Missing ADMIN_SITE_URL");
      return json(
        {
          ok: false,
          message: "ADMIN_SITE_URL 환경변수가 없습니다.",
        },
        500
      );
    }

    // --------------------------------------------------
    // 현재 로그인 사용자 확인
    // --------------------------------------------------
    const authHeader =
      req.headers.get("Authorization") || "";

    if (!authHeader.startsWith("Bearer ")) {
      return json(
        {
          ok: false,
          message: "로그인이 필요합니다.",
        },
        401
      );
    }

    const accessToken =
      authHeader.replace("Bearer ", "").trim();

    const authClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    // Verify the exact bearer token supplied with this request.
    const {
      data: userData,
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      console.error(
        "Auth user error:",
        userError
      );

      return json(
        {
          ok: false,
          message: "유효한 로그인 세션이 아닙니다.",
        },
        401
      );
    }

    const authUser = userData.user;

    // --------------------------------------------------
    // Service Role client
    // --------------------------------------------------
    const adminClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    // --------------------------------------------------
    // users 테이블에서 관리자 확인
    // --------------------------------------------------
    const {
      data: profile,
      error: profileError,
    } = await adminClient
      .from("users")
      .select(
        "user_id, login_id, name, user_level, is_admin"
      )
      .eq("user_id", String(authUser.id))
      .single();

    if (profileError) {
      console.error(
        "Profile error:",
        profileError
      );

      return json(
        {
          ok: false,
          message: "관리자 정보를 확인할 수 없습니다.",
        },
        403
      );
    }

    if (
      !profile ||
      profile.is_admin !== true ||
      Number(profile.user_level || 0) < 10
    ) {
      return json(
        {
          ok: false,
          message: "관리자 권한이 없습니다.",
        },
        403
      );
    }

    // --------------------------------------------------
    // 관리자 이메일 확인
    // --------------------------------------------------
    const email =
      authUser.email || "";

    if (!email) {
      return json(
        {
          ok: false,
          message:
            "관리자 계정에 이메일 주소가 없습니다.",
        },
        400
      );
    }

    // --------------------------------------------------
    // 인증 이메일 재발송 제한: 계정당 1분에 1회
    // --------------------------------------------------
    const recentCutoff = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentCount, error: recentError } = await adminClient
      .from("admin_verification_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUser.id)
      .gte("created_at", recentCutoff);
    if (recentError) {
      console.error("Verification rate-limit lookup failed:", recentError.code);
      return json({ ok: false, message: "인증 요청을 처리하지 못했습니다." }, 503);
    }
    if ((recentCount ?? 0) >= 1) {
      return json({ ok: false, message: "인증 이메일은 1분에 한 번만 요청할 수 있습니다." }, 429);
    }

    // Invalidate older outstanding links so only the newest link can be used.
    const { error: invalidateError } = await adminClient
      .from("admin_verification_tokens")
      .update({ used: true })
      .eq("user_id", authUser.id)
      .eq("used", false);
    if (invalidateError) {
      console.error("Previous verification token invalidation failed:", invalidateError.code);
      return json({ ok: false, message: "인증 요청을 처리하지 못했습니다." }, 503);
    }

    // --------------------------------------------------
    // 단일 사용 인증 토큰 생성 (10분)
    // --------------------------------------------------
    const verifyToken = crypto.randomUUID();
    const { error: tokenInsertError } = await adminClient
      .from("admin_verification_tokens")
      .insert({
        user_id: authUser.id,
        token: verifyToken,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        used: false,
      });

    if (tokenInsertError) {
      console.error("Admin verification token insert failed:", tokenInsertError.code);
      return json({ ok: false, message: "인증 요청을 준비하지 못했습니다." }, 500);
    }

    const redirectUrl = new URL(ADMIN_SITE_URL);
    redirectUrl.searchParams.set("admin_verify_token", verifyToken);

    // --------------------------------------------------
    // Magic Link 생성
    // --------------------------------------------------
    const {
      data: magicData,
      error: magicError,
    } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: redirectUrl.toString(),
      },
    });

    if (magicError) {
      console.error(
        "Magic link generation error:",
        magicError
      );

      return json(
        {
          ok: false,
          message:
            "관리자 인증 링크 생성에 실패했습니다.",
          error: magicError.message,
        },
        500
      );
    }

    const actionLink =
      magicData?.properties?.action_link;

    if (!actionLink) {
      console.error(
        "Magic link missing action_link"
      );

      return json(
        {
          ok: false,
          message:
            "인증 링크를 생성했지만 링크 주소를 가져오지 못했습니다.",
        },
        500
      );
    }

    // --------------------------------------------------
    // Resend 이메일 HTML
    // --------------------------------------------------
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>돌이 관리자 인증</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#050816;
    color:#ffffff;
    font-family:Arial,sans-serif;
  "
>

<div
  style="
    max-width:620px;
    margin:40px auto;
    padding:32px;
    background:#0b1230;
    border:1px solid #273469;
    border-radius:18px;
  "
>

  <div
    style="
      font-size:34px;
      font-weight:700;
      margin-bottom:10px;
    "
  >
    🐶 돌이 관리자 센터
  </div>

  <p
    style="
      color:#b8c3e0;
      font-size:15px;
      line-height:1.7;
    "
  >
    관리자 센터에 로그인하려면 아래 버튼을 눌러
    이메일 인증을 완료해 주세요.
  </p>

  <div
    style="
      margin:24px 0;
      padding:18px;
      background:#070d24;
      border-radius:12px;
    "
  >
    <div style="color:#8f9bc5;font-size:13px;">
      관리자 계정
    </div>

    <div
      style="
        margin-top:5px;
        font-size:17px;
        font-weight:700;
      "
    >
      ${email}
    </div>

    <div
      style="
        margin-top:8px;
        color:#8f9bc5;
        font-size:13px;
      "
    >
      ${profile.name || profile.login_id || ""}
    </div>
  </div>

  <a
    href="${actionLink}"
    style="
      display:block;
      text-align:center;
      padding:15px 20px;
      background:#315efb;
      color:#ffffff;
      text-decoration:none;
      border-radius:12px;
      font-weight:700;
      font-size:16px;
    "
  >
    🔐 관리자 인증하기
  </a>

  <p
    style="
      margin-top:22px;
      color:#7f8bad;
      font-size:12px;
      line-height:1.6;
    "
  >
    이 링크는 관리자 이메일 인증을 위한 링크입니다.
    <br>
    로그인했던 브라우저가 아닌 다른 브라우저에서도
    인증할 수 있습니다.
  </p>

</div>

</body>
</html>
`;

    // 기존 방식 복구: Resend API로 관리자 인증 이메일 발송.
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: VERIFY_FROM_EMAIL,
        to: [email],
        subject: "🔐 돌이 관리자 센터 이메일 인증",
        html,
        text: `돌이 관리자 센터 이메일 인증\n\n아래 링크를 열어 관리자 인증을 완료해 주세요:\n${actionLink}\n\n이 링크는 짧은 시간 동안만 유효합니다.`,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text();
      const { error: invalidateFailedTokenError } = await adminClient
        .from("admin_verification_tokens")
        .update({ used: true })
        .eq("user_id", authUser.id)
        .eq("token", verifyToken)
        .eq("used", false);
      if (invalidateFailedTokenError) console.error("Failed to invalidate unsent admin verification token:", invalidateFailedTokenError.code);
      console.error("Resend rejected admin verification email:", resendResponse.status, resendError.slice(0, 500));
      return json({ ok: false, code: "EMAIL_SEND_FAILED", message: "관리자 인증 이메일 발송에 실패했습니다. 이메일 발송 설정을 확인해 주세요." }, 502);
    }

    return json({
      ok: true,
      verified: false,
      message:
        "관리자 인증 이메일을 발송했습니다.",
    });

  } catch (error) {
    console.error(
      "admin-request-verification error:",
      error
    );

    return json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "서버 오류가 발생했습니다.",
      },
      500
    );
  }
});