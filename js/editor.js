const cfg = window.DORI_ADMIN_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);

const params = new URLSearchParams(location.search);
const issueParam = params.get("issue");
const isNew = params.get("new") === "1";
const state = { user:null, profile:null, row:null, editing:false, isNew:false };

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
function toast(msg, ok=true) {
  const el = $("#editorToast"); if (!el) return;
  el.textContent = msg; el.className = ok ? "show ok" : "show";
  clearTimeout(window.__editorToast); window.__editorToast = setTimeout(()=>el.className="", 2800);
}
function formatDate(v) {
  if (!v) return "";
  const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR");
}
function isQuizReady(r) {
  if (!r) return false;
  const q = String(r.question ?? "").trim();
  const a = String(r.answer ?? "").trim();
  const type = String(r.question_type ?? "multiple_choice").trim();
  const choices = [1,2,3,4,5].map(n=>String(r[`choice${n}`] ?? "").trim()).filter(Boolean);
  if (type === "ox" || type === "short_answer") return Boolean(q && a);
  return Boolean(q && a && choices.length);
}
function answerNumber(v) {
  const s = String(v ?? "").trim();
  if (/^[1-5]$/.test(s)) return Number(s);
  const m = s.match(/[1-5]/); return m ? Number(m[0]) : 0;
}
function goList() { location.href = "./index.html#news"; }
$("#backList").onclick = goList;
$("#backAdmin").onclick = goList;

async function boot() {
  try {
    const {data:{session}, error} = await sb.auth.getSession();
    if (error) throw error;
    if (!session?.user) throw new Error("관리자 센터에서 먼저 로그인해 주세요.");
    state.user = session.user;
    const {data, error:pe} = await sb.from("users").select("*").eq("user_id", String(session.user.id)).single();
    if (pe) throw pe;
    if (data.is_admin !== true || Number(data.user_level || 0) < 10) throw new Error("관리자 권한이 없습니다.");
    state.profile = data;
    $("#editorUser").textContent = data.name || data.login_id || session.user.email || "ADMIN";
    $("#editorApp").classList.remove("hidden");
    await loadIssue();
  } catch (e) {
    console.error(e);
    $("#editorAuthText").textContent = e.message || "관리자 인증에 실패했습니다.";
    $("#editorAuth").classList.remove("hidden");
  }
}

async function loadIssue() {
  if (isNew) {
    const next = Number(issueParam);
    state.isNew = true;
    state.row = {
      news_number: Number.isInteger(next) && next > 0 ? next : 1,
      rockey_news:"", question:"", question_type:"multiple_choice",
      choice1:"", choice2:"", choice3:"", choice4:"", choice5:"", answer:""
    };
    renderEditor();
    return;
  }
  if (!issueParam) { showNotice("회차 번호가 없습니다.", true); return; }
  const {data,error} = await sb.from("rockey_news").select("news_number,rockey_news,question,question_type,choice1,choice2,choice3,choice4,choice5,answer").eq("news_number", issueParam).maybeSingle();
  if (error) { showNotice(error.message, true); return; }
  if (!data) { showNotice(`제${esc(issueParam)}호 데이터를 찾을 수 없습니다.`, true); return; }
  state.row = data;
  renderView();
}
function showNotice(msg, error=false) {
  const n=$("#editorNotice"); n.textContent=msg; n.className=`editor-notice ${error?"error":""}`;
  n.classList.remove("hidden"); $("#issueView").innerHTML="";
}

function renderView() {
  const r=state.row, ready=isQuizReady(r), num=esc(r.news_number);
  const choices=[1,2,3,4,5].map(n=>({n,text:r[`choice${n}`]})).filter(x=>String(x.text??"").trim());
  const ans=answerNumber(r.answer);
  $("#issueView").innerHTML=`
    <section class="issue-hero">
      <div class="issue-kicker">DORI NEWS · ${num}</div>
      <div class="issue-hero-line"><div><h1>제${num}호</h1><p>${ready?"신문과 퀴즈가 모두 준비되어 있습니다.":"신문은 확인되었지만 퀴즈가 아직 작성되지 않았습니다."}</p></div><span class="big-status ${ready?"ready":"missing"}">${ready?"✓ COMPLETE":"! QUIZ MISSING"}</span></div>
    </section>
    <section class="content-preview-grid">
      <article class="content-card news-preview-card">
        <div class="content-card-head"><span class="round-icon">📰</span><div><span class="eyebrow">NEWS ARTICLE</span><h2>돌이신문</h2></div></div>
        <div class="article-body">${r.rockey_news ? esc(r.rockey_news).replace(/\n/g,"<br>") : '<div class="empty-inline">신문 내용이 아직 없습니다.</div>'}</div>
      </article>
      <article class="content-card quiz-preview-card">
        <div class="content-card-head"><span class="round-icon">❓</span><div><span class="eyebrow">QUIZ</span><h2>돌이퀴즈</h2></div><span class="quiz-state ${ready?"ready":"missing"}">${ready?"작성됨":"미작성"}</span></div>
        ${r.question ? `<div class="question-box"><small>QUESTION</small><h3>${esc(r.question)}</h3></div>
          <div class="choice-preview">${choices.map(x=>`<div class="choice ${x.n===ans?"answer":""}"><span>${x.n}</span><b>${esc(x.text)}</b>${x.n===ans?'<i>정답</i>':''}</div>`).join("")}</div>
          <div class="answer-box">정답 <strong>${ans ? `${ans}번` : esc(r.answer)}</strong></div>`
          : `<div class="missing-quiz"><div>❓</div><b>퀴즈가 아직 작성되지 않았습니다.</b><span>편집 화면에서 문제와 선택지를 작성할 수 있습니다.</span></div>`}
      </article>
    </section>
    <div class="editor-actions"><button class="secondary" id="backToList2">← 목록으로</button><button class="primary editor-main-btn" id="editIssue">✎ ${ready?"내용 수정":"퀴즈 작성 / 내용 수정"}</button></div>
  `;
  $("#backToList2").onclick=goList; $("#editIssue").onclick=()=>{state.editing=true;renderEditor();};
}

function renderEditor() {
  const r=state.row;
  $("#issueView").innerHTML=`
    <section class="edit-header"><div><span class="eyebrow">EDITOR MODE</span><h1>제${esc(r.news_number)}호 편집</h1><p>신문과 퀴즈를 한 화면에서 작성하고 저장합니다.</p></div><span class="save-state" id="saveState">● 편집 중</span></section>
    <form id="issueForm" class="professional-form">
      <div class="form-grid">
        <section class="edit-card full"><div class="edit-card-head"><span class="round-icon">📰</span><div><h2>돌이신문</h2><small>신문 본문</small></div></div><label>회차 번호<input id="newsNumber" type="number" min="1" required value="${esc(r.news_number)}"></label><label>신문 내용<textarea id="newsText" rows="18" placeholder="돌이신문 내용을 입력하세요.">${esc(r.rockey_news)}</textarea></label></section>
        <section class="edit-card"><div class="edit-card-head"><span class="round-icon">❓</span><div><h2>돌이퀴즈</h2><small>문제와 선택지를 작성하세요.</small></div></div>
          <label>문제<textarea id="question" rows="6" placeholder="퀴즈 문제를 입력하세요.">${esc(r.question)}</textarea></label>
          <label>문제 유형<select id="questionType"><option value="multiple_choice" ${r.question_type==="multiple_choice"?"selected":""}>객관식</option><option value="ox" ${r.question_type==="ox"?"selected":""}>OX</option><option value="short_answer" ${r.question_type==="short_answer"?"selected":""}>주관식</option></select></label>
          <div class="choices-grid">${[1,2,3,4,5].map(n=>`<label>선택지 ${n}<input id="choice${n}" value="${esc(r[`choice${n}`])}" placeholder="선택지 ${n}"></label>`).join("")}</div>
          <div class="answer-picker"><span>정답 선택</span><div>${[1,2,3,4,5].map(n=>`<label><input type="radio" name="answer" value="${n}" ${answerNumber(r.answer)===n?"checked":""}> ${n}번</label>`).join("")}</div><input id="answerRaw" value="${esc(r.answer)}" placeholder="정답이 숫자가 아닌 경우 직접 입력"></div>
        </section>
      </div>
      <div class="editor-actions sticky-actions"><button type="button" class="secondary" id="cancelEdit">취소</button><button type="submit" class="primary editor-main-btn" id="saveIssue">✓ 저장하기</button></div>
    </form>`;
  $("#cancelEdit").onclick=()=>state.isNew?goList():renderView();
  $("#issueForm").onsubmit=saveIssue;
  document.querySelectorAll('input[name="answer"]').forEach(x=>x.onchange=()=>{$("#answerRaw").value="";});
  $("#answerRaw").oninput=()=>document.querySelectorAll('input[name="answer"]').forEach(x=>x.checked=false);
}

async function saveIssue(e) {
  e.preventDefault();
  const btn=$("#saveIssue"); btn.disabled=true; btn.textContent="저장 중…";
  const selected=document.querySelector('input[name="answer"]:checked');
  const raw=String($("#answerRaw").value||"").trim();
  const answer=raw || selected?.value || "";
  const payload={
    news_number:Number($("#newsNumber").value),
    rockey_news:$("#newsText").value,
    question:$("#question").value,
    question_type:$("#questionType").value,
    choice1:$("#choice1").value, choice2:$("#choice2").value, choice3:$("#choice3").value,
    choice4:$("#choice4").value, choice5:$("#choice5").value, answer
  };
  if(!Number.isInteger(payload.news_number)||payload.news_number<1){toast("회차 번호를 확인하세요.",false);btn.disabled=false;btn.textContent="✓ 저장하기";return;}
  const quizStarted=payload.question.trim() || answer || [1,2,3,4,5].some(n=>payload[`choice${n}`].trim());
  if(quizStarted && (!payload.question.trim() || !answer)){toast("퀴즈를 작성했다면 문제와 정답을 모두 입력하세요.",false);btn.disabled=false;btn.textContent="✓ 저장하기";return;}
  if(answer && !/^[1-5]$/.test(answer) && payload.question_type==="multiple_choice"){toast("객관식 정답은 1~5번 중 하나로 입력하세요.",false);btn.disabled=false;btn.textContent="✓ 저장하기";return;}
  try {
    let error;
    if(state.isNew){ const res=await sb.from("rockey_news").insert(payload); error=res.error; }
    else { const old=state.row.news_number; const res=await sb.from("rockey_news").update(payload).eq("news_number",old); error=res.error; }
    if(error) throw error;
    toast("저장되었습니다.");
    state.isNew=false; state.row=payload; history.replaceState(null,"",`./editor.html?issue=${encodeURIComponent(payload.news_number)}`); renderView();
  } catch(err){console.error(err);toast(err.message||"저장에 실패했습니다.",false);btn.disabled=false;btn.textContent="✓ 저장하기";}
}

sb.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT") location.href="./index.html";
});
boot();
