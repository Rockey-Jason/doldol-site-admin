const cfg=window.DORI_ADMIN_CONFIG||{};
const sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s), content=$("#content");
const state={user:null,profile:null,page:"dashboard",selected:new Set(),cache:[]};
const pageNames={dashboard:"대시보드",users:"회원 관리",news:"돌이신문",quiz:"돌이퀴즈",box:"랜덤박스",events:"이벤트",economy:"코인 내역",stats:"통계",logs:"활동 로그",security:"보안"};
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function toast(msg,ok=true){const t=$("#toast");t.className="toast";t.innerHTML=`<div class="toast-item ${ok?"ok":"bad"}">${esc(msg)}</div>`;setTimeout(()=>t.className="",2800)}
function fmt(v){if(v==null||v==="")return "—"; if(typeof v==="object")return JSON.stringify(v); return esc(v)}
function date(v){return v?new Date(v).toLocaleString("ko-KR"):"—"}
async function currentUser(){const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session?.user||null}
async function loadProfile(u){
 const {data,error}=await sb.from("users").select("*").eq("user_id",u.id).maybeSingle();
 if(error)throw error;if(!data||data.is_admin!==true||Number(data.user_level||0)<10)throw new Error("관리자 권한이 없습니다.");
 state.user=u;state.profile=data;$("#adminName").textContent=data.name||data.login_id||u.email||"관리자";
}
async function requestEmailVerification(){
 const {data:{session}}=await sb.auth.getSession(); if(!session)throw new Error("로그인이 필요합니다.");
 const r=await fetch(cfg.VERIFY_EMAIL_FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`,apikey:cfg.SUPABASE_ANON_KEY},body:"{}"});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||"인증 메일 발송 실패");
}
function showApp(){$("#authGate").classList.add("hidden");$("#app").classList.remove("hidden")}
function openEditor(type,id){location.href=`editor.html?type=${encodeURIComponent(type)}${id?`&id=${encodeURIComponent(id)}`:""}`}
async function count(table){const {count,error}=await sb.from(table).select("*",{count:"exact",head:true});if(error)return 0;return count||0}
function setNav(page){document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("#pageTitle").textContent=pageNames[page]||page}
async function render(page){state.page=page;setNav(page);try{if(page==="dashboard")return dashboard();if(page==="users")return users();if(page==="news")return contentPage("📰 돌이신문","rockey_news",["news_number","rockey_news","question","question_type","choice1","choice2","choice3","choice4","choice5","answer"],"news");if(page==="quiz")return contentPage("❓ 돌이퀴즈","rockey_news",["news_number","question","question_type","choice1","choice2","choice3","choice4","choice5","answer"],"quiz");if(page==="box")return contentPage("🎁 랜덤박스 아이템","dori_box_items",["id","item_code","item_name","probability","reward_coins","reward_exp"],"box");if(page==="events")return contentPage("🎉 신문 이벤트","rockey_news_events",["news_number","enabled","event_name","description","reward_coins"],"event");if(page==="economy")return economy();if(page==="stats")return stats();if(page==="logs")return logs();if(page==="security")return security()}catch(e){content.innerHTML=`<div class="panel warning">${esc(e.message)}</div>`}}
async function dashboard(){
 content.innerHTML=`<div class="hero"><div class="eyebrow">OVERVIEW</div><h1>돌이 운영 현황</h1><p>회원 상태부터 콘텐츠와 경제 시스템까지 실시간으로 확인하고 관리합니다.</p></div><div class="grid cards" id="cards"></div><div class="panel"><h2>최근 관리자 활동</h2><div id="recent">불러오는 중…</div></div>`;
 const vals=await Promise.all([count("users"),count("rockey_news"),count("dori_box_items"),count("rockey_news_events")]);
 $("#cards").innerHTML=[["👥",vals[0],"전체 회원"],["📰",vals[1],"신문"],["🎁",vals[2],"랜덤박스"],["🎉",vals[3],"이벤트"]].map(x=>`<div class="stat-card"><span>${x[0]}</span><b>${x[1].toLocaleString()}</b><small>${x[2]}</small></div>`).join("");
 const {data}=await sb.from("admin_logs").select("*").order("created_at",{ascending:false}).limit(10);
 $("#recent").innerHTML=data?.length?`<div class="row-list">${data.map(x=>`<div class="activity-row"><span>${fmt(x.action)}</span><span class="muted-sm">${date(x.created_at)}</span></div>`).join("")}</div>`:`<div class="empty">기록이 없습니다.</div>`;
}
async function users(){
 content.innerHTML=`<div class="hero"><div class="eyebrow">MEMBERS</div><h1>전체 회원 관리</h1><p>공개 프로필 데이터와 Supabase Auth 상태를 함께 확인합니다.</p></div><div class="toolbar"><input class="grow" id="userSearch" placeholder="회원번호 · 아이디 · 이름 · 이메일 검색"><button class="secondary" id="reload">↻ 새로고침</button><button class="primary" id="bulk">선택 회원 코인 지급</button></div><div class="panel"><div id="userTable">불러오는 중…</div></div>`;
 $("#reload").onclick=users;$("#bulk").onclick=bulkReward;$("#userSearch").oninput=()=>loadUsers($("#userSearch").value);await loadUsers("");
}
async function loadUsers(q){
 let {data,error}=await sb.rpc("admin_list_users");
 if(error){$("#userTable").innerHTML=`<div class="warning">${esc(error.message)}</div>`;return}
 state.cache=(data||[]).filter(u=>!q||`${u.login_id||""} ${u.name||""} ${u.user_number||""} ${u.auth_email||""}`.toLowerCase().includes(q.toLowerCase()));
 $("#userTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>선택</th><th>번호</th><th>아이디</th><th>이름</th><th>Lv</th><th>코인</th><th>EXP</th><th>상태</th><th>이메일</th><th>최근 로그인</th><th>관리</th></tr></thead><tbody>${state.cache.map(u=>{let suspended=u.permanently_banned?"영구정지":u.suspended_until&&new Date(u.suspended_until)>new Date()?`정지 ${date(u.suspended_until)}`:"정상";return `<tr><td><input class="sel" type="checkbox" data-id="${esc(u.user_id)}"></td><td>${fmt(u.user_number)}</td><td>${fmt(u.login_id)}</td><td>${fmt(u.name)}</td><td>${fmt(u.user_level)}</td><td>${Number(u.doldolcoin||0).toLocaleString()}</td><td>${Number(u.exp||0).toLocaleString()}</td><td><span class="badge ${suspended==="정상"?"ok":"bad"}">${esc(suspended)}</span></td><td>${fmt(u.auth_email)} <span class="badge ${u.auth_confirmed_at?"ok":"warn"}">${u.auth_confirmed_at?"확인":"미확인"}</span></td><td>${date(u.last_sign_in_at)}</td><td><button class="mini" onclick="openEditor('user','${esc(u.user_id)}')">상세 편집</button></td></tr>`}).join("")}</tbody></table></div>`;
}
window.openEditor=openEditor;
async function numberDialog(title,initial="1000"){
 return new Promise(resolve=>{
  const wrap=document.createElement("div");wrap.className="modal-backdrop";wrap.innerHTML=`<div class="modal glass"><div class="eyebrow">BULK ACTION</div><h2>${esc(title)}</h2><label>금액<input id="modalNumber" type="number" value="${esc(initial)}"></label><div class="modal-actions"><button class="secondary" id="modalCancel">취소</button><button class="primary" id="modalOk">적용</button></div></div>`;
  document.body.appendChild(wrap);const done=v=>{wrap.remove();resolve(v)};wrap.querySelector("#modalCancel").onclick=()=>done(null);wrap.querySelector("#modalOk").onclick=()=>done(Number(wrap.querySelector("#modalNumber").value));wrap.querySelector("#modalNumber").focus();
 });
}
async function bulkReward(){const ids=[...document.querySelectorAll(".sel:checked")].map(x=>x.dataset.id);if(!ids.length)return toast("회원을 선택하세요.",false);const amount=await numberDialog("선택 회원 코인 일괄 반영","1000");if(amount===null||!Number.isFinite(amount))return;for(const id of ids){const {error}=await sb.rpc("admin_adjust_coins",{p_user_id:id,p_amount:amount,p_reason:"관리자 일괄 지급"});if(error)return toast(error.message,false)}toast(`${ids.length}명에게 코인을 반영했습니다.`);loadUsers($("#userSearch").value)}
async function contentPage(title,table,cols,type){
 content.innerHTML=`<div class="hero"><div class="eyebrow">CONTENT STUDIO</div><h1>${title}</h1><p>목록을 확인하고 전문 편집 화면에서 내용을 수정할 수 있습니다.</p></div><div class="toolbar"><input class="grow" id="crudSearch" placeholder="검색"><button class="primary" id="add">＋ 새로 만들기</button><button class="secondary" id="refresh">↻ 새로고침</button></div><div class="panel"><div id="crud">불러오는 중…</div></div>`;
 $("#add").onclick=()=>openEditor(type);$("#refresh").onclick=()=>render(state.page);$("#crudSearch").oninput=e=>filterCrud(e.target.value);
 const {data,error}=await sb.from(table).select("*").order(cols[0],{ascending:false}).limit(500);
 if(error){$("#crud").innerHTML=`<div class="warning">${esc(error.message)}</div>`;return}
 state.crudData=data||[];state.crudCols=cols;state.crudType=type;drawCrud("");
}
function drawCrud(q){const rows=state.crudData.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));$("#crud").innerHTML=rows.length?rows.map(r=>`<div class="crud-row"><div><b>${fmt(r[state.crudCols[0]])}</b><span>${fmt(r.rockey_news||r.question||r.event_name||r.item_name||r.description||"")}</span></div><button class="mini" onclick="openEditor('${esc(state.crudType)}','${esc(r[state.crudCols[0]])}')">편집</button></div>`).join(""):`<div class="empty">데이터가 없습니다.</div>`}
function filterCrud(q){drawCrud(q)}
async function economy(){
 content.innerHTML=`<div class="hero"><div class="eyebrow">DOLDOL ECONOMY</div><h1>돌돌코인 사용 내역</h1><p>관리자 지급/차감 기록과 랜덤박스 관련 기록을 한 화면에서 확인합니다.</p></div><div class="toolbar"><input class="grow" id="coinSearch" placeholder="회원 UUID 또는 사유 검색"><button class="secondary" id="coinRefresh">↻ 새로고침</button></div><div class="panel"><div id="coinTable">불러오는 중…</div></div>`;
 $("#coinRefresh").onclick=economy;$("#coinSearch").oninput=e=>drawCoins(e.target.value);
 const {data,error}=await sb.from("doldolcoin_transactions").select("*").order("created_at",{ascending:false}).limit(500);
 if(error){$("#coinTable").innerHTML=`<div class="warning">거래 원장 테이블을 아직 만들지 않았거나 접근할 수 없습니다. 아래 SQL을 한 번 실행하세요.<br><br>doldolcoin_transactions</div>`;return}
 state.coins=data||[];drawCoins("");
}
function drawCoins(q){const rows=state.coins.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q.toLowerCase()));$("#coinTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>시간</th><th>회원</th><th>변동</th><th>잔액</th><th>사유</th><th>관리자</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${date(x.created_at)}</td><td>${fmt(x.user_id)}</td><td>${Number(x.amount||0).toLocaleString()}</td><td>${fmt(x.balance_after)}</td><td>${fmt(x.reason)}</td><td>${fmt(x.admin_user_id)}</td></tr>`).join("")}</tbody></table></div>`}
async function stats(){
 content.innerHTML=`<div class="hero"><div class="eyebrow">ANALYTICS</div><h1>운영 통계</h1></div><div class="grid cards" id="statsCards"></div><div class="panel"><h2>회원 등급 분포</h2><div id="levels"></div></div>`;
 const {data}=await sb.from("users").select("user_level,doldolcoin,exp,is_admin");const a=data||[];const coins=a.reduce((x,u)=>x+Number(u.doldolcoin||0),0),exp=a.reduce((x,u)=>x+Number(u.exp||0),0),admins=a.filter(x=>x.is_admin).length;
 $("#statsCards").innerHTML=[["👥",a.length,"회원"],["🪙",coins.toLocaleString(),"총 돌돌코인"],["⭐",exp.toLocaleString(),"총 EXP"],["🛡️",admins,"관리자"]].map(x=>`<div class="stat-card"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join("");
 const m={};a.forEach(x=>m[x.user_level]=(m[x.user_level]||0)+1);$("#levels").innerHTML=Object.entries(m).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`<div class="activity-row"><span>Lv.${esc(k)}</span><b>${v}명</b></div>`).join("")||"—";
}
async function logs(){content.innerHTML=`<div class="hero"><div class="eyebrow">AUDIT TRAIL</div><h1>관리자 활동 로그</h1></div><div class="panel"><div id="logtable">불러오는 중…</div></div>`;const {data,error}=await sb.from("admin_logs").select("*").order("created_at",{ascending:false}).limit(500);$("#logtable").innerHTML=error?`<div class="warning">${esc(error.message)}</div>`:`<div class="table-wrap"><table><thead><tr><th>시간</th><th>작업</th><th>대상</th><th>상세</th></tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${date(x.created_at)}</td><td>${fmt(x.action)}</td><td>${fmt(x.target_user_id)}</td><td>${fmt(x.details)}</td></tr>`).join("")}</tbody></table></div>`}
async function security(){content.innerHTML=`<div class="hero"><div class="eyebrow">SECURITY</div><h1>보안 센터</h1><p>회원별 상세 편집 화면에서 정지, 관리자 권한, 상태를 관리할 수 있습니다.</p></div><div class="panel warning"><b>주의</b><p>관리자 권한과 영구정지는 실제 운영 권한에 직접 영향을 줍니다. 모든 변경은 관리자 로그에 남도록 구성했습니다.</p></div><div class="toolbar"><button class="primary" onclick="render('users')">회원 상태 열기</button><button class="secondary" onclick="render('logs')">감사 로그 보기</button></div>`}
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#authStatus").textContent="로그인 확인 중…";try{const r=await fetch(cfg.ADMIN_LOGIN_LOOKUP_URL,{method:"POST",headers:{"Content-Type":"application/json",apikey:cfg.SUPABASE_ANON_KEY},body:JSON.stringify({login_id:$("#loginId").value.trim()})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.email)throw new Error("아이디를 확인할 수 없습니다.");const {error}=await sb.auth.signInWithPassword({email:d.email,password:$("#password").value});if(error)throw error;const u=await currentUser();await loadProfile(u);await requestEmailVerification();$("#authStatus").textContent="인증 메일을 보냈습니다. 메일의 인증 버튼을 누르면 관리자 센터가 열립니다."; }catch(x){console.error(x);$("#authStatus").textContent=x.message||"로그인 실패";await sb.auth.signOut().catch(()=>{})}}
$("#logout").onclick=async()=>{await sb.auth.signOut();location.reload()};
$("#nav").onclick=e=>{const b=e.target.closest("button[data-page]");if(b)render(b.dataset.page)};
async function boot(){try{const u=await currentUser();if(!u)return;await loadProfile(u);showApp();render("dashboard")}catch(e){console.error(e);await sb.auth.signOut().catch(()=>{});$("#authStatus").textContent=e.message||"관리자 인증에 실패했습니다."}}
boot();
