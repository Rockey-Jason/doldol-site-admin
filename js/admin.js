const cfg = window.DORI_ADMIN_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const content = $("#content");
const state = { user:null, profile:null, page:"dashboard", selected:new Set() };

function toast(msg, ok=true){ const e=$("#toast"); e.textContent=msg; e.className=ok?"show ok":"show"; setTimeout(()=>e.className="",2800); }
function esc(v){ return String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
async function currentUser(){
  const {data:{user}}=await sb.auth.getUser(); return user;
}
async function loadProfile(user){
  const {data,error}=await sb.from("users").select("*").eq("user_id",user.id).single();
  if(error) throw error;
  if(!data.is_admin || Number(data.user_level||0)<10) throw new Error("관리자 권한이 없습니다.");
  state.user=user; state.profile=data; $("#adminName").textContent=` · ${data.name||data.login_id||user.email||""}`;
}
async function signIn(id,pw){
  // login_id -> auth email은 DB의 email 컬럼 또는 auth 이메일을 쓰는 구조를 권장합니다.
  // 아래 RPC는 login_id와 비밀번호 검증을 서버에서 수행하도록 설계됩니다.
  const {data,error}=await sb.rpc("admin_sign_in", {p_login_id:id,p_password:pw});
  if(error) throw error;
  if(!data?.user_id || !data?.email) throw new Error("관리자 계정을 확인할 수 없습니다.");
  const {error:ae}=await sb.auth.signInWithPassword({email:data.email,password:pw});
  if(ae) throw ae;
  const user=await currentUser(); await loadProfile(user);
  // 비밀번호 자체를 이메일 함수에 보내지 않습니다. 서버가 현재 Auth 세션을 확인합니다.
  if(!cfg.VERIFY_EMAIL_FUNCTION_URL) throw new Error("VERIFY_EMAIL_FUNCTION_URL을 설정하세요.");
  const r=await fetch(cfg.VERIFY_EMAIL_FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${(await sb.auth.getSession()).data.session?.access_token}`},body:JSON.stringify({admin_user_id:user.id})});
  if(!r.ok) throw new Error("인증 이메일 발송에 실패했습니다.");
  $("#authStatus").textContent="인증 이메일을 확인하세요.";
  return true;
}
async function boot(){
  try{
    const u=await currentUser();
    if(u){ await loadProfile(u); showApp(); render("dashboard"); }
  }catch(e){ await sb.auth.signOut(); }
}
function showApp(){ $("#authGate").classList.add("hidden"); $("#app").classList.remove("hidden"); }
function render(page){
  state.page=page; state.selected.clear();
  document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  $("#pageTitle").textContent=document.querySelector(`#nav button[data-page="${page}"]`)?.textContent.trim()||"관리";
  ({dashboard,users,news,quiz,box,events,stats,logs,security}[page]||dashboard)();
}
async function count(table){ const {count}=await sb.from(table).select("*",{count:"exact",head:true}); return count||0; }

async function dashboard(){
  content.innerHTML=`<div class="hero"><h1>돌이 관리자 센터 🐶</h1><p>사이트의 핵심 데이터를 한 곳에서 관리하세요.</p></div><div class="grid cards" id="cards"></div><div class="panel"><h2>최근 활동</h2><div id="recent">불러오는 중...</div></div>`;
  const [users,news,items,events]=await Promise.all([count("users"),count("rockey_news"),count("dori_box_items"),count("rockey_news_events")]);
  $("#cards").innerHTML=[["회원",users,"👥"],["신문",news,"📰"],["랜덤박스 아이템",items,"🎁"],["이벤트",events,"🎉"]].map(x=>`<div class="stat-card"><span>${x[2]}</span><b>${x[1].toLocaleString()}</b><small>${x[0]}</small></div>`).join("");
  await recent();
}
async function recent(){
  const {data}=await sb.from("admin_logs").select("*").order("created_at",{ascending:false}).limit(10);
  $("#recent").innerHTML=data?.length?data.map(l=>`<div class="row"><span>${esc(l.action)}</span><small>${new Date(l.created_at).toLocaleString()}</small></div>`).join(""):"기록이 없습니다.";
}
async function users(){
  content.innerHTML=`<div class="toolbar"><input id="userSearch" placeholder="아이디/이름/회원번호 검색"><button class="secondary" id="reload">새로고침</button><button class="primary" id="bulk">선택 회원 일괄 지급</button></div><div class="panel"><div id="userTable">불러오는 중...</div></div>`;
  $("#reload").onclick=users; $("#bulk").onclick=bulkReward; $("#userSearch").oninput=()=>loadUsers($("#userSearch").value);
  await loadUsers("");
}
async function loadUsers(q){
  let query=sb.from("users").select("user_id,user_number,login_id,name,user_level,doldolcoin,exp,is_admin,equipped_title").order("user_number",{ascending:true}).limit(500);
  if(q) query=query.or(`login_id.ilike.%${q}%,name.ilike.%${q}%,user_number.eq.${Number(q)||-1}`);
  const {data,error}=await query; if(error){$("#userTable").textContent=error.message;return;}
  $("#userTable").innerHTML=`<table><thead><tr><th><input type="checkbox" id="all"></th><th>번호</th><th>아이디</th><th>이름</th><th>Lv</th><th>코인</th><th>EXP</th><th>관리자</th><th>조작</th></tr></thead><tbody>${data.map(u=>`<tr><td><input type="checkbox" class="sel" data-id="${u.user_id}"></td><td>${esc(u.user_number)}</td><td>${esc(u.login_id)}</td><td>${esc(u.name)}</td><td>${esc(u.user_level)}</td><td>${esc(u.doldolcoin)}</td><td>${esc(u.exp)}</td><td>${u.is_admin?"TRUE":"FALSE"}</td><td><button class="mini" onclick='editUser(${JSON.stringify(u)})'>수정</button></td></tr>`).join("")}</tbody></table>`;
  $("#all").onchange=e=>document.querySelectorAll(".sel").forEach(x=>x.checked=e.target.checked);
}
window.editUser=async u=>{
  const coins=prompt("돌돌코인 (현재 "+u.doldolcoin+")",u.doldolcoin); if(coins===null)return;
  const exp=prompt("EXP (현재 "+u.exp+")",u.exp); if(exp===null)return;
  const level=prompt("user_level",u.user_level); if(level===null)return;
  const {error}=await sb.rpc("admin_update_user",{p_user_id:u.user_id,p_doldolcoin:Number(coins),p_exp:Number(exp),p_user_level:Number(level)});
  if(error) toast(error.message,false); else {toast("회원 정보가 수정되었습니다.");loadUsers($("#userSearch").value);}
};
async function bulkReward(){
  const ids=[...document.querySelectorAll(".sel:checked")].map(x=>x.dataset.id);
  if(!ids.length)return toast("회원을 선택하세요.",false);
  const coins=Number(prompt("선택 회원에게 지급할 돌돌코인","1000")); if(!Number.isFinite(coins))return;
  for(const id of ids){ const {error}=await sb.rpc("admin_adjust_coins",{p_user_id:id,p_amount:coins,p_reason:"관리자 일괄 지급"}); if(error)return toast(error.message,false); }
  toast(`${ids.length}명에게 지급했습니다.`);loadUsers("");
}
async function news(){ crudPage("📰 돌이신문","rockey_news",["news_number","rockey_news","question","question_type","choice1","choice2","choice3","choice4","choice5","answer"]); }
async function quiz(){ crudPage("❓ 돌이 퀴즈","rockey_news",["news_number","question","question_type","choice1","choice2","choice3","choice4","choice5","answer"]); }
async function crudPage(title,table,cols){
  content.innerHTML=`<div class="toolbar"><button class="primary" id="add">＋ 새로 만들기</button><button class="secondary" id="refresh">새로고침</button></div><div class="panel"><h2>${title}</h2><div id="crud">불러오는 중...</div></div>`;
  $("#add").onclick=()=>editRecord(table,cols,{});
  $("#refresh").onclick=()=>crudPage(title,table,cols);
  const {data,error}=await sb.from(table).select("*").order(cols[0],{ascending:false}).limit(200);
  if(error){$("#crud").textContent=error.message;return;}
  $("#crud").innerHTML=data?.map(r=>`<div class="crud-row"><div><b>${esc(r[cols[0]])}</b><span>${esc(r.rockey_news||r.question||"")}</span></div><button class="mini" onclick='editRecord(${JSON.stringify(table)},${JSON.stringify(cols)},${JSON.stringify(r)})'>수정</button></div>`).join("")||"데이터가 없습니다.";
}
window.editRecord=async(table,cols,row)=>{
  const payload={};
  for(const c of cols){ const v=prompt(c, row[c]??""); if(v===null)return; payload[c]=v; }
  const key=cols[0], q=row[key]!=null?sb.from(table).update(payload).eq(key,row[key]):sb.from(table).insert(payload);
  const {error}=await q; if(error)toast(error.message,false);else{toast("저장되었습니다.");render(state.page);}
};
async function box(){ crudPage("🎁 랜덤박스 아이템","dori_box_items",["id","item_code","item_name","probability","reward_coins","reward_exp"]); }
async function events(){ crudPage("🎉 이벤트","rockey_news_events",["news_number","enabled","event_name","description","reward_coins"]); }
async function stats(){
  content.innerHTML=`<div class="grid cards"><div class="stat-card"><span>📈</span><b id="uc">-</b><small>회원</small></div><div class="stat-card"><span>🪙</span><b id="tc">-</b><small>총 돌돌코인</small></div><div class="stat-card"><span>⭐</span><b id="te">-</b><small>총 EXP</small></div></div><div class="panel"><h2>통계</h2><p>실제 합계는 보안 RPC를 통해 계산하도록 구성할 수 있습니다.</p></div>`;
  const {data}=await sb.from("users").select("doldolcoin,exp");
  $("#uc").textContent=(data?.length||0).toLocaleString();$("#tc").textContent=(data||[]).reduce((a,x)=>a+Number(x.doldolcoin||0),0).toLocaleString();$("#te").textContent=(data||[]).reduce((a,x)=>a+Number(x.exp||0),0).toLocaleString();
}
async function logs(){
  content.innerHTML=`<div class="panel"><h2>🧾 관리자 로그</h2><div id="logtable">불러오는 중...</div></div>`;
  const {data,error}=await sb.from("admin_logs").select("*").order("created_at",{ascending:false}).limit(300);
  $("#logtable").innerHTML=error?esc(error.message):`<table><thead><tr><th>시간</th><th>관리자</th><th>작업</th><th>대상</th><th>상세</th></tr></thead><tbody>${(data||[]).map(l=>`<tr><td>${new Date(l.created_at).toLocaleString()}</td><td>${esc(l.admin_user_id)}</td><td>${esc(l.action)}</td><td>${esc(l.target_user_id)}</td><td>${esc(JSON.stringify(l.details||{}))}</td></tr>`).join("")}</tbody></table>`;
}
async function security(){
  content.innerHTML=`<div class="panel"><h2>🛡️ 계정 보안 / 정지</h2><p>회원 관리에서 회원을 검색한 뒤 보안 RPC를 호출하는 구조입니다.</p><div class="warning">영구 정지와 관리자 권한 변경은 반드시 서버측 RPC/RLS에서 검증하세요.</div><button class="secondary" onclick="users()">회원 관리로 이동</button></div>`;
}
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#authStatus").textContent="관리자 확인 중…";try{await signIn($("#loginId").value.trim(),$("#password").value);showApp();render("dashboard");}catch(x){$("#authStatus").textContent=x.message;await sb.auth.signOut();}};
$("#logout").onclick=async()=>{await sb.auth.signOut();location.reload();};
$("#nav").onclick=e=>{const b=e.target.closest("button[data-page]");if(b)render(b.dataset.page);};
boot();