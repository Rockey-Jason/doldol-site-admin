import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://rockey-jason.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST") return json({message:"POST 요청만 허용됩니다."},405);
 try{
  const authHeader=req.headers.get("Authorization")??"";
  if(!authHeader.startsWith("Bearer ")) return json({message:"로그인이 필요합니다."},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const site=Deno.env.get("ADMIN_SITE_URL"),resendKey=Deno.env.get("RESEND_API_KEY"),to=Deno.env.get("ADMIN_VERIFY_EMAIL"),from=Deno.env.get("VERIFY_FROM_EMAIL");
  if(!url||!anon||!service||!site||!resendKey||!to||!from) return json({message:"서버 이메일 설정이 완료되지 않았습니다."},500);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
  const {data:{user},error:ue}=await caller.auth.getUser();
  if(ue||!user) return json({message:"유효한 로그인 세션이 아닙니다."},401);
  const admin=createClient(url,service);
  const {data:profile,error:pe}=await admin.from("users").select("user_id,email:login_id,name,is_admin,user_level").eq("user_id",user.id).maybeSingle();
  if(pe) return json({message:"관리자 권한 확인에 실패했습니다."},500);
  if(!profile?.is_admin||Number(profile.user_level??0)<10) return json({message:"관리자 권한이 없습니다."},403);

  const {data:authUser,error:ae}=await admin.auth.admin.getUserById(user.id);
  if(ae||!authUser.user?.email) return json({message:"관리자 이메일을 확인할 수 없습니다."},500);
  const {data:magic,error:me}=await admin.auth.admin.generateLink({
    type:"magiclink",
    email:authUser.user.email,
    options:{redirectTo:site}
  });
  const link=magic?.properties?.action_link;
  if(me||!link) { console.error(me); return json({message:"인증 링크 생성에 실패했습니다."},500); }

  const resend=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    from,to:[to],subject:"돌이 관리자 센터 · 보안 로그인 링크",
    html:`<!doctype html><html lang="ko"><body style="margin:0;background:#030714;color:#edf4ff;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:48px 24px"><div style="background:#08152e;border:1px solid #23385e;border-radius:26px;padding:34px"><div style="font-size:42px">🐶</div><h1>돌이 관리자 센터</h1><p style="color:#a8b8d2;line-height:1.8">관리자 보안 로그인을 완료하려면 아래 버튼을 눌러 주세요. 이 링크를 다른 사람과 공유하지 마세요.</p><a href="${link}" style="display:inline-block;padding:15px 23px;background:#347fff;color:white;text-decoration:none;border-radius:13px;font-weight:bold">보안 로그인 완료</a><p style="color:#7789a8;font-size:13px;line-height:1.7;margin-top:25px">본인이 요청하지 않았다면 이 메일을 무시하세요.</p></div></div></body></html>`
  })});
  if(!resend.ok){console.error(await resend.text());return json({message:"인증 이메일 발송에 실패했습니다."},502)}
  return json({ok:true});
 }catch(e){console.error(e);return json({message:"인증 메일 처리 중 오류가 발생했습니다."},500)}
});