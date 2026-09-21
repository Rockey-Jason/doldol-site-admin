// 이 파일을 config.js 로 사용하세요.
// Publishable/anon key만 브라우저에 넣습니다.
// service_role/secret key는 절대로 넣지 마세요.
window.DORI_ADMIN_CONFIG = {
  SUPABASE_URL: "https://scttowfhygcpdirrekqm.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjdHRvd2ZoeWdjcGRpcnJla3FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTg0MjYsImV4cCI6MjA5NTc3NDQyNn0.XwdQhJ4Ku_C61yXz0k65AztMF9Rfe7Qzn3Av7iWRBqY",
  ADMIN_LOGIN_LOOKUP_URL:
    "https://scttowfhygcpdirrekqm.supabase.co/functions/v1/admin-login-email",
  VERIFY_EMAIL_FUNCTION_URL:
    "https://scttowfhygcpdirrekqm.supabase.co/functions/v1/admin-request-verification",
  VERIFY_EMAIL_CONFIRM_URL:
    "https://scttowfhygcpdirrekqm.supabase.co/functions/v1/admin-verify-email"
};
