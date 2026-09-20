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
    return new Response("ok", {
      status: 204,
      headers: cors,
    });
  }

  if (req.method !== "POST") {
    return json({ message: "POST 요청만 허용됩니다." }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const loginId = String(body?.login_id ?? "").trim();

    if (!loginId || loginId.length > 100) {
      return json({ message: "관리자 계정을 확인할 수 없습니다." }, 400);
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (!serviceRoleKey || !supabaseUrl) {
      console.error("Supabase service configuration is missing.");
      return json({ message: "서버 인증 설정 오류입니다." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // users.user_id must match auth.users.id.
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("user_id,login_id,is_admin,user_level")
      .eq("login_id", loginId)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed:", profileError);
      return json({ message: "관리자 계정을 확인하는 중 오류가 발생했습니다." }, 500);
    }

    // Keep the response intentionally generic so non-admin users do not
    // receive useful account details.
    if (
      !profile?.user_id ||
      profile.is_admin !== true ||
      Number(profile.user_level ?? 0) < 10
    ) {
      return json({ message: "관리자 계정을 확인할 수 없습니다." }, 401);
    }

    const authUserId = String(profile.user_id);

    const { data: authResult, error: authError } =
      await admin.auth.admin.getUserById(authUserId);

    if (authError || !authResult?.user?.email) {
      console.error("Auth user lookup failed:", authError);
      return json({ message: "관리자 인증 계정의 이메일을 찾을 수 없습니다." }, 401);
    }

    return json({
      email: authResult.user.email,
    });
  } catch (error) {
    console.error("admin-login-email error:", error);
    return json({ message: "로그인 계정을 확인하는 중 오류가 발생했습니다." }, 500);
  }
});
