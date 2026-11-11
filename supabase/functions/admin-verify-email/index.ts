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
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    }
  );
}

Deno.serve(async (req) => {
  // ============================================
  // CORS Preflight
  // ============================================
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // ============================================
  // POST만 허용
  // ============================================
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
    // ============================================
    // Authorization 확인
    // ============================================
    const authHeader =
      req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return json(
        {
          ok: false,
          message: "로그인이 필요합니다.",
        },
        401
      );
    }

    // A validated access token must contain the Supabase Auth session_id claim.
    const accessToken = authHeader.slice("Bearer ".length).trim();
    let sessionId = "";
    try {
      const parts = accessToken.split(".");
      if (parts.length !== 3) throw new Error("invalid jwt");
      const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
      sessionId = String(payload.session_id || "");
    } catch (_) {
      return json({ ok: false, message: "인증 세션을 확인할 수 없습니다." }, 401);
    }
    if (!sessionId || sessionId.length > 100) {
      return json({ ok: false, message: "인증 세션을 확인할 수 없습니다." }, 401);
    }

    // ============================================
    // Request Body
    // ============================================
    const body =
      await req.json().catch(() => ({}));

    const token =
      String(body?.token ?? "").trim();

    if (!token || token.length > 200) {
      return json(
        {
          ok: false,
          message:
            "유효하지 않은 인증 링크입니다.",
        },
        400
      );
    }

    // ============================================
    // Supabase 환경변수
    // ============================================
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const anonKey =
      Deno.env.get(
        "SUPABASE_ANON_KEY"
      );

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey
    ) {
      console.error(
        "Supabase configuration is missing."
      );

      return json(
        {
          ok: false,
          message:
            "서버 인증 설정 오류입니다.",
        },
        500
      );
    }

    // ============================================
    // 현재 로그인한 Auth 사용자 확인
    // ============================================
    const userClient = createClient(
      supabaseUrl,
      anonKey,
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
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

    if (
      userError ||
      !user
    ) {
      console.error(
        "Auth user lookup failed:",
        userError
      );

      return json(
        {
          ok: false,
          message:
            "유효한 로그인 세션이 아닙니다.",
        },
        401
      );
    }

    // ============================================
    // Service Role Client
    // ============================================
    const admin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      );

    // ============================================
    // 관리자 권한 확인
    // ============================================
    const {
      data: profile,
      error: profileError,
    } =
      await admin
        .from("users")
        .select(
          "user_id,is_admin,user_level"
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (profileError) {
      console.error(
        "Profile lookup failed:",
        profileError
      );

      return json(
        {
          ok: false,
          message:
            "관리자 권한을 확인하는 중 오류가 발생했습니다.",
        },
        500
      );
    }

    if (
      !profile?.is_admin ||
      Number(
        profile.user_level ?? 0
      ) < 10
    ) {
      return json(
        {
          ok: false,
          message:
            "관리자 권한이 없습니다.",
        },
        403
      );
    }

    // ============================================
    // 인증 토큰 조회
    // ============================================
    const {
      data: row,
      error: tokenError,
    } =
      await admin
        .from(
          "admin_verification_tokens"
        )
        .select(
          "id,user_id,expires_at,used"
        )
        .eq(
          "token",
          token
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (tokenError) {
      console.error(
        "Token lookup failed:",
        tokenError
      );

      return json(
        {
          ok: false,
          message:
            "인증 링크를 확인하는 중 오류가 발생했습니다.",
        },
        500
      );
    }

    if (!row) {
      return json(
        {
          ok: false,
          message:
            "유효하지 않은 인증 링크입니다.",
        },
        400
      );
    }

    // ============================================
    // 이미 사용된 토큰
    // ============================================
    if (row.used) {
      return json(
        {
          ok: false,
          message:
            "이미 사용된 인증 링크입니다.",
        },
        400
      );
    }

    // ============================================
    // 만료 확인
    // ============================================
    if (
      new Date(
        row.expires_at
      ).getTime() <= Date.now()
    ) {
      return json(
        {
          ok: false,
          message:
            "인증 링크가 만료되었습니다. 다시 로그인해 주세요.",
        },
        400
      );
    }

    // ============================================
    // 토큰 소비
    // ============================================
    const {
      data: consumed,
      error: consumeError,
    } =
      await admin
        .from(
          "admin_verification_tokens"
        )
        .update({
          used: true,
        })
        .eq(
          "id",
          row.id
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "used",
          false
        )
        .select("id")
        .maybeSingle();

    if (consumeError) {
      console.error(
        "Token consume failed:",
        consumeError
      );

      return json(
        {
          ok: false,
          message:
            "인증 상태를 저장하지 못했습니다.",
        },
        500
      );
    }

    if (!consumed) {
      return json(
        {
          ok: false,
          message:
            "인증 링크가 이미 사용되었습니다.",
        },
        400
      );
    }

    // ============================================
    // 인증된 Auth 세션을 서버 DB에 등록 (30분)
    // ============================================
    const { error: sessionError } = await admin
      .from("admin_verification_sessions")
      .upsert({
        user_id: user.id,
        session_id: sessionId,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, { onConflict: "user_id,session_id" });

    if (sessionError) {
      console.error("Verified admin session persistence failed:", sessionError.code);
      return json({ ok: false, message: "인증 상태를 저장하지 못했습니다. 다시 인증해 주세요." }, 500);
    }

    // ============================================
    // 성공
    // ============================================
    return json({
      ok: true,
      verified: true,
      expires_in: 1800,
    });

  } catch (error) {
    console.error(
      "admin-verify-email error:",
      error
    );

    return json(
      {
        ok: false,
        message:
          "이메일 인증 처리 중 오류가 발생했습니다.",
      },
      500
    );
  }
});