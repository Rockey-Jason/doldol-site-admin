// 이 파일을 config.js 로 사용하세요.
// Publishable/anon key만 브라우저에 넣습니다.
// service_role/secret key는 절대로 넣지 마세요.
window.DORI_ADMIN_CONFIG = {
  SUPABASE_URL: "https://scttowfhygcpdirrekqm.supabase.co",
  SUPABASE_ANON_KEY: "",
  ADMIN_LOGIN_LOOKUP_URL:
    "https://scttowfhygcpdirrekqm.supabase.co/functions/v1/admin-login-email",
  VERIFY_EMAIL_FUNCTION_URL:
    "https://scttowfhygcpdirrekqm.supabase.co/functions/v1/admin-request-verification",
  VERIFY_EMAIL_CONFIRM_URL:
    "https://scttowfhygcpdirrekqm.supabase.co/functions/v1/admin-verify-email"
};
