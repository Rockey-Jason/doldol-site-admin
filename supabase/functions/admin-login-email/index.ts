import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { login_id } = await req.json();
    const loginId = String(login_id ?? "").trim();

    if (!loginId) {
      return new Response(JSON.stringify({ message: "아이디를 입력하세요." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("user_id,login_id,is_admin,user_level")
      .eq("login_id", loginId)
      .maybeSingle();

    if (profileError || !profile?.user_id ||
        !profile.is_admin || Number(profile.user_level ?? 0) < 10) {
      return new Response(JSON.stringify({ message: "관리자 계정을 확인할 수 없습니다." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const userId = String(profile.user_id);
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const authUser = data.users.find(u => u.id === userId);
      if (authUser?.email) {
        return new Response(JSON.stringify({ email: authUser.email }), {
          status: 200, headers: { ...cors, "Content-Type": "application/json" }
        });
      }

      if (data.users.length < perPage) break;
      page++;
    }

    return new Response(JSON.stringify({ message: "인증 계정의 이메일을 찾을 수 없습니다." }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ message: "로그인 계정을 확인하는 중 오류가 발생했습니다." }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
