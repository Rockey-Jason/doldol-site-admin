const cfg=window.DORI_ADMIN_CONFIG||{};
const sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function toast(m,ok=true){const e=$("#toast");if(!e)return;e.textContent=m;e.className=ok?"show ok":"";clearTimeout(window.__t);window.__t=setTimeout(()=>e.className="",3500)}
async function requireAdmin(){const {data,error}=await sb.auth.getSession();if(error||!data.session?.user)throw new Error("관리자 로그인 세션이 없습니다.");const {data:p,error:e}=await sb.from("users").select("is_admin,user_level,name").eq("user_id",String(data.session.user.id)).single();if(e)throw e;if(p?.is_admin!==true||Number(p.user_level||0)<10)throw new Error("관리자 권한이 없습니다.");}
const param=()=>new URLSearchParams(location.search).get("news_number");
const creating=()=>new URLSearchParams(location.search).get("new")==="1";
const defaultOptions=[{value:"A",label:"돌돌코인"},{value:"B",label:"도로늄"},{value:"C",label:"로키 포인트"},{value:"D",label:"돌이젬"}];
let loadedAnswer="A";
async function load(){
 let d={id:null,news_number:"",enabled:true,event_name:"",description:"",event_type:"coin",reward_coins:10000,reward_multiplier:2,reward_duration_minutes:60,quiz_question:"돌이사이트에서 사용하는 가상 화폐의 이름은 무엇인가요?",quiz_options:defaultOptions,max_attempts:5};
 if(!creating()){
  const n=param();if(!n){notice("이벤트 번호가 없습니다.");return}
  const {data,error}=await sb.from("rockey_news_events").select("id,news_number,enabled,event_name,description,event_type,reward_coins,reward_multiplier,reward_duration_minutes,quiz_question,quiz_options,max_attempts").eq("news_number",n).single();
  if(error){notice(error.message);return}d={...d,...data};
  const key=await sb.rpc("admin_get_news_event_quiz_key",{p_event_id:d.id});
  if(key.data?.success)loadedAnswer=key.data.answer||"A";
  else if(key.error)console.warn("정답 조회:",key.error.message);
 }
 render(d);
}
function notice(m){$("#editorApp").innerHTML=`<div class="auth-error"><div>⚠️</div><h1>이벤트 편집기를 열 수 없습니다.</h1><p>${esc(m)}</p><a class="primary" href="./index.html#events">이벤트 목록</a></div>`;}
function render(d){
 const c=creating();const opts=Array.isArray(d.quiz_options)&&d.quiz_options.length===4?d.quiz_options:defaultOptions;
 const type=["coin","coin_multiplier","balance_multiplier"].includes(d.event_type)?d.event_type:"coin";
 $("#editorApp").innerHTML=`
 <div class="special-shell editor-only-shell">
  <header class="special-head"><div><button class="back-link" id="back">← 이벤트 목록</button><span class="eyebrow">EVENT / ${c?"CREATE":"EDIT"}</span><h1>🎉 이벤트 ${c?"생성":"수정"}</h1><p>${c?"새 이벤트와 특별 퀴즈를 만듭니다.":`이벤트 #${esc(d.news_number)}의 보상과 퀴즈를 설정합니다.`}</p></div><div class="editor-badge">${c?"CREATE MODE":"EDIT MODE"}</div></header>
  <div class="editor-layout">
   <section class="panel editor-main-card">
    <div class="editor-section-head"><div><span class="eyebrow">EVENT INFORMATION</span><h2>이벤트 정보</h2></div>${c?"":`<span class="id-chip">#${esc(d.news_number)}</span>`}</div>
    <form id="eventForm" class="professional-form">
     <div class="form-grid two">
      <label>이벤트 번호<input name="news_number" type="number" min="1" required ${c?"":"readonly"} value="${esc(d.news_number)}"></label>
      <label>이벤트 이름<input name="event_name" required value="${esc(d.event_name)}"></label>
     </div>
     <label>이벤트 설명<textarea name="description" rows="3">${esc(d.description)}</textarea></label>
     <label class="toggle-line professional-toggle"><input name="enabled" type="checkbox" ${d.enabled!==false?"checked":""}><span><b>이벤트 활성화</b><small>비활성화하면 이벤트 퀴즈에 참여할 수 없습니다.</small></span></label>
     <div class="editor-section-head" style="margin-top:14px"><div><span class="eyebrow">REWARD CONFIGURATION</span><h2>🎁 보상 방식</h2></div></div>
     <label>보상 종류
      <select name="event_type" id="rewardType">
       <option value="coin" ${type==="coin"?"selected":""}>🪙 고정 돌돌코인 지급</option>
       <option value="coin_multiplier" ${type==="coin_multiplier"?"selected":""}>⚡ 돌돌코인 수급량 배수 (기간제)</option>
       <option value="balance_multiplier" ${type==="balance_multiplier"?"selected":""}>💎 현재 보유 코인 × 배수만큼 추가 지급</option>
      </select>
     </label>
     <div id="fixedRewardField"><label>정답 보상 돌돌코인<input name="reward_coins" type="number" min="0" step="1" value="${Number(d.reward_coins||0)}"><small class="form-help">정답을 맞히면 이 금액을 한 번 지급합니다.</small></label></div>
     <div id="multiplierFields" class="form-grid two">
      <label>배수 (원하는 양수 입력)<input name="reward_multiplier" id="rewardMultiplier" type="number" min="0.000001" step="any" value="${esc(d.reward_multiplier||2)}" required><small class="form-help">2, 3.5, 7.25, 100 등 직접 입력할 수 있습니다.</small></label>
      <label id="durationField">효과 지속 시간 (분)<input name="reward_duration_minutes" type="number" min="1" max="525600" step="1" value="${Number(d.reward_duration_minutes||60)}" required><small class="form-help">기간제 수급량 배수에만 적용됩니다.</small></label>
     </div>
     <div class="issue-live-note" id="rewardHelp"><span>REWARD PREVIEW</span><b>보상 안내</b><small>선택한 보상 방식에 따라 안내가 바뀝니다.</small></div>
     <div class="editor-section-head" style="margin-top:22px"><div><span class="eyebrow">SPECIAL QUIZ</span><h2>🧩 특별 퀴즈</h2></div></div>
     <label>퀴즈 문제<textarea name="quiz_question" rows="3" minlength="5" required>${esc(d.quiz_question||"")}</textarea></label>
     <div class="form-grid two">
      ${["A","B","C","D"].map((k,i)=>{const o=opts.find(x=>String(x.value)===k)||opts[i]||{};return `<label>선택지 ${k}<input name="option_${k}" required value="${esc(o.label||"")}" placeholder="선택지 ${k}"></label>`;}).join("")}
     </div>
     <label>정답 선택
      <select name="quiz_answer" required>
       ${["A","B","C","D"].map(k=>`<option value="${k}" ${loadedAnswer===k?"selected":""}>${k}번 선택지가 정답</option>`).join("")}
      </select>
     </label>
     <div class="issue-live-note"><span>QUIZ RULE</span><b>도전 기회는 5회로 고정</b><small>정답 확인은 서버에서 처리하고 정답 키는 일반 사용자에게 공개하지 않습니다.</small></div>
     <div class="editor-actions"><button type="button" class="secondary" id="cancel">취소</button><button type="submit" class="primary" id="save">💾 ${c?"이벤트 생성 및 설정 저장":"변경사항 저장"}</button></div>
    </form>
   </section>
  </div>
 </div>`;
 $("#back").onclick=$("#cancel").onclick=()=>location.href="./index.html#events";
 $("#rewardType").onchange=updateRewardFields;
 $("#eventForm").onsubmit=save;
 updateRewardFields();
}
function updateRewardFields(){
 const type=$("#rewardType").value;
 $("#fixedRewardField").style.display=type==="coin"?"block":"none";
 $("#multiplierFields").style.display=type==="coin"?"none":"grid";
 $("#durationField").style.display=type==="coin_multiplier"?"block":"none";
 $("[name='reward_duration_minutes']").required=type==="coin_multiplier";
 const help=$("#rewardHelp");
 if(type==="coin")help.innerHTML="<span>REWARD PREVIEW</span><b>고정 코인 지급</b><small>정답을 맞히면 설정한 코인을 한 번 지급합니다. 이미 활성화된 수급 배수가 있으면 일반 보상 정책에 따라 적용될 수 있습니다.</small>";
 else if(type==="coin_multiplier")help.innerHTML="<span>REWARD PREVIEW</span><b>기간제 수급량 배수</b><small>설정한 배수가 입력한 시간 동안 돌돌코인 보상 경로에 적용됩니다. 배수는 임의의 양수로 설정할 수 있습니다.</small>";
 else help.innerHTML="<span>REWARD PREVIEW</span><b>현재 보유 코인 × 배수만큼 즉시 추가 지급</b><small>기간이 없는 일회성 지급입니다. 정답을 맞히는 순간의 보유 코인을 기준으로 계산합니다. 예: 20,000코인 보유 중 3배면 60,000코인을 추가 지급합니다.</small>";
}
async function save(e){
 e.preventDefault();const f=e.currentTarget;const n=Number(f.news_number.value);
 const type=f.event_type.value;const rewardCoins=Number(f.reward_coins.value||0);const multiplier=Number(f.reward_multiplier.value);
 const duration=Number(f.reward_duration_minutes.value);
 const options=["A","B","C","D"].map(k=>({value:k,label:f["option_"+k].value.trim()}));
 if(!Number.isInteger(n)||n<1||!f.event_name.value.trim()||!Number.isSafeInteger(rewardCoins)||rewardCoins<0){toast("이벤트 번호, 이름, 코인 보상을 확인해 주세요.",false);return}
 if(type!=="coin"&&(!Number.isFinite(multiplier)||multiplier<=0||multiplier>1e12)){toast("배수는 0보다 크고 1조 이하인 숫자로 입력해 주세요.",false);return}
 if(type==="coin_multiplier"&&(!Number.isInteger(duration)||duration<1||duration>525600)){toast("기간제 배수의 지속 시간은 1~525,600분으로 입력해 주세요.",false);return}
 if(!f.quiz_question.value.trim()||f.quiz_question.value.trim().length<5||options.some(o=>!o.label)){toast("퀴즈 문제와 A~D 선택지를 모두 입력해 주세요.",false);return}
 const b=$("#save");b.disabled=true;b.textContent="저장 중…";
 try{
  await requireAdmin();
  const {error:baseError}=await sb.rpc("admin_save_news_event",{p_old_news_number:creating()?null:Number(param()),p_news_number:n,p_enabled:f.enabled.checked,p_event_name:f.event_name.value.trim(),p_description:f.description.value.trim(),p_reward_coins:Math.floor(rewardCoins)});
  if(baseError)throw baseError;
  const {data:event,error:findError}=await sb.from("rockey_news_events").select("id").eq("news_number",n).single();
  if(findError)throw findError;
  const {data:configured,error:configError}=await sb.rpc("admin_configure_news_event",{
   p_event_id:event.id,p_event_type:type,p_reward_coins:Math.floor(rewardCoins),
   p_reward_multiplier:type==="coin"?1:multiplier,
   p_duration_minutes:type==="coin_multiplier"?Math.floor(duration):1,
   p_question:f.quiz_question.value.trim(),p_options:options,p_answer:f.quiz_answer.value
  });
  if(configError)throw configError;
  if(!configured?.success)throw new Error(configured?.message||"이벤트 보상 설정을 저장하지 못했습니다.");
  toast(creating()?"이벤트와 특별 퀴즈를 생성했습니다.":"이벤트 보상과 특별 퀴즈를 저장했습니다.");
  setTimeout(()=>location.href="./index.html#events",600);
 }catch(err){
  b.disabled=false;b.textContent=creating()?"💾 이벤트 생성 및 설정 저장":"💾 변경사항 저장";
  toast(err.message||"저장에 실패했습니다.",false);
 }
}
(async()=>{try{await requireAdmin();await load()}catch(e){notice(e.message)}})();
