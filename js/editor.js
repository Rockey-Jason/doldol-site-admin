const cfg=window.DORI_ADMIN_CONFIG||{}, sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s), params=new URLSearchParams(location.search), type=params.get("type")||"user", id=params.get("id");
const configs={
 user:{title:"회원 상세 편집",kicker:"MEMBER PROFILE",table:"users",key:"user_id"},
 news:{title:"돌이신문 편집",kicker:"NEWS STUDIO",table:"rockey_news",key:"news_number"},
 quiz:{title:"돌이퀴즈 편집",kicker:"QUIZ STUDIO",table:"rockey_news",key:"news_number"},
 box:{title:"랜덤박스 아이템 편집",kicker:"ITEM STUDIO",table:"dori_box_items",key:"id"},
 event:{title:"신문 이벤트 편집",kicker:"EVENT STUDIO",table:"rockey_news_events",key:"news_number"}
};
let row=null, original=null, fields=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const toast=(m,ok=true)=>{const t=$("#toast");t.innerHTML=`<div class="toast-item ${ok?"ok":"bad"}">${esc(m)}</div>`;setTimeout(()=>t.innerHTML="",2800)};
async function auth(){const {data,error}=await sb.auth.getSession();if(error)throw error;if(!data.session)throw new Error("로그인이 필요합니다.");const {data:p,error:e}=await sb.from("users").select("*").eq("user_id",data.session.user.id).maybeSingle();if(e||!p||!p.is_admin||Number(p.user_level)<10)throw new Error("관리자 권한이 없습니다.");}
function valFor(k,v){if(v===null||v===undefined)return"";if(typeof v==="object")return JSON.stringify(v,null,2);return String(v)}
function fieldDef(k,v){
 const long=["rockey_news","question","description","suspension_reason","profile_image","user_achievement","quiz_answers"].includes(k);
 const bool=["enabled","is_admin","permanently_banned"].includes(k);
 const number=["news_number","id","user_number","user_level","doldolcoin","exp","probability","reward_coins","reward_exp"].includes(k);
 const dateLike=["suspended_until","created_at","updated_at"].includes(k);
 return {k,v,long,bool,number,dateLike};
}
function drawForm(){
 $("#editorKicker").textContent=configs[type]?.kicker||"EDITOR";$("#editorTitle").textContent=configs[type]?.title||"편집";
 $("#sideMeta").innerHTML=`<div class="muted-sm">대상</div><div style="margin:6px 0 18px;word-break:break-all">${esc(id||"새 레코드")}</div><div class="muted-sm">변경 방식</div><div style="margin-top:6px">저장 전 로컬 변경<br>저장 후 관리자 로그</div>`;
 const entries=Object.keys(row||{}).filter(k=>!["updated_at"].includes(k));
 $("#formRoot").innerHTML=`<div class="section-head"><div><h2>${configs[type]?.title||"편집"}</h2><p>${id?"기존 데이터를 안전하게 수정합니다.":"새 데이터를 작성합니다."}</p></div></div><div class="form-grid">${entries.map(k=>{const d=fieldDef(k,row[k]);let input;if(d.bool)input=`<select data-field="${esc(k)}"><option value="false" ${row[k]===false?"selected":""}>false</option><option value="true" ${row[k]===true?"selected":""}>true</option></select>`;else if(d.long)input=`<textarea data-field="${esc(k)}" ${k==="user_id"?"readonly":""}>${esc(valFor(k,row[k]))}</textarea>`;else input=`<input data-field="${esc(k)}" type="${d.number?"number":d.dateLike?"datetime-local":"text"}" value="${esc(d.dateLike&&row[k]?new Date(row[k]).toISOString().slice(0,16):valFor(k,row[k]))}" ${k==="user_id"||["login_id","user_number","created_at","auth_email","auth_created_at","auth_confirmed_at","last_sign_in_at","banned_until","auth_role"].includes(k)?"readonly":""}>`;return `<div class="field ${d.long?"full":""}"><div class="field-label"><span>${esc(k)}</span><span class="field-help">${d.bool?"boolean":d.number?"number":d.long?"long text":"text"}</span></div>${input}</div>`}).join("")}</div>`;
 document.querySelectorAll("[data-field]").forEach(el=>el.addEventListener("input",()=>{$("#saveState").textContent="저장되지 않은 변경사항";$("#saveState").style.color="#ffd27d"}));
}
function readForm(){const o={};document.querySelectorAll("[data-field]").forEach(el=>{let v=el.value,k=el.dataset.field;if(["true","false"].includes(v)&&["enabled","is_admin","permanently_banned"].includes(k))v=v==="true";else if(el.type==="number")v=v===""?null:Number(v);else if(["user_achievement","quiz_answers"].includes(k)&&v.trim()){try{v=JSON.parse(v)}catch{throw new Error(`${k} JSON 형식이 올바르지 않습니다.`)}}else if(el.type==="datetime-local"&&v)v=new Date(v).toISOString();o[k]=v});return o}
async function save(){
 try{const payload=readForm(); if(type==="user"){const {error}=await sb.rpc("admin_update_user_full",{p_user_id:id,p_payload:payload});if(error)throw error}else{let q;if(id)q=sb.from(configs[type].table).update(payload).eq(configs[type].key,id);else q=sb.from(configs[type].table).insert(payload);const {error}=await q;if(error)throw error}toast("저장되었습니다.");$("#saveState").textContent="저장 완료";$("#saveState").style.color="#72efb3";original=JSON.stringify(payload);row={...row,...payload}}catch(e){toast(e.message||"저장 실패",false)}}
async function load(){
 try{await auth();if(!configs[type])throw new Error("알 수 없는 편집 종류입니다.");if(id){if(type==="user"){const {data,error}=await sb.rpc("admin_get_user_detail",{p_user_id:id});if(error)throw error;row=data?.[0]||data; if(!row)throw new Error("회원을 찾을 수 없습니다.")}else{const {data,error}=await sb.from(configs[type].table).select("*").eq(configs[type].key,id).maybeSingle();if(error)throw error;row=data;if(!row)throw new Error("데이터를 찾을 수 없습니다.")}}else{row={};const defaults={news:{news_number:"",question_type:"multiple"},quiz:{news_number:"",question_type:"multiple"},box:{item_code:"",probability:0,reward_coins:0,reward_exp:0},event:{news_number:"",enabled:false,reward_coins:0}};Object.assign(row,defaults[type]||{})}original=JSON.stringify(row);drawForm()}catch(e){$("#formRoot").innerHTML=`<div class="warning">${esc(e.message)}</div>`}}
$("#saveBtn").onclick=save;$("#backBtn").onclick=()=>history.length>1?history.back():(location.href="index.html");load();
