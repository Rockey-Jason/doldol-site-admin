const cfg=window.DORI_ADMIN_CONFIG||{};const sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function toast(msg,ok=true){const e=$("#toast");e.textContent=msg;e.className=ok?"show ok":"show";clearTimeout(window.__t);window.__t=setTimeout(()=>e.className="",3500)}
async function requireAdmin(){const {data,error}=await sb.auth.getSession();if(error||!data.session?.user)throw new Error("관리자 로그인 세션이 없습니다.");const {data:p,error:pe}=await sb.from("users").select("is_admin,user_level,name").eq("user_id",String(data.session.user.id)).single();if(pe)throw pe;if(p?.is_admin!==true||Number(p.user_level||0)<10)throw new Error("관리자 권한이 없습니다.");}
async function loadStocks(){const {data,error}=await sb.from("dori_stocks").select("id,ticker,name,current_price").eq("is_active",true).order("id");if(error)throw error;return data||[]}
async function render(){const stocks=await loadStocks();$("#econApp").innerHTML=`
<div class="econ-shell">
<header class="econ-head"><div><span class="eyebrow">DOLDOL SECURITIES / ECONOMY</span><h1>💹 돌돌증권 경제 관리</h1><p>기업 실적과 배당을 운영하고, 실제 체결가와 기준가가 분리된 가상 시장을 관리합니다.</p></div><a class="primary" href="./index.html">← 관리자 센터</a></header>
<div class="econ-grid">
<section class="econ-card"><h2>📊 기업 실적 등록</h2><p>실적은 reference_price에 제한된 범위로 반영됩니다. current_price를 가짜 체결처럼 변경하지 않습니다.</p>
<form id="financialForm" class="econ-form">
<label>종목<select name="stock_id">${stocks.map(s=>`<option value="${s.id}">${esc(s.name)} · ${esc(s.ticker)}</option>`).join("")}</select></label>
<div class="econ-two"><label>기간명<input name="period_label" placeholder="2026 Q3" required></label><label>기말일<input name="period_end" type="date" required></label></div>
<div class="econ-two"><label>매출<input name="revenue" type="number" value="0" required></label><label>영업이익<input name="operating_profit" type="number" value="0" required></label></div>
<div class="econ-two"><label>순이익<input name="net_profit" type="number" value="0" required></label><label>EPS<input name="eps" type="number" step="0.01" value="0" required></label></div>
<div class="econ-two"><label>매출 성장률 %<input name="revenue_growth" type="number" step="0.1" value="0"></label><label>이익 성장률 %<input name="profit_growth" type="number" step="0.1" value="0"></label></div>
<label>가이던스<textarea name="guidance" placeholder="다음 분기 전망"></textarea></label><label>경영진 코멘트<textarea name="comment"></textarea></label>
<div class="econ-action"><button class="primary" type="submit">실적 반영</button></div></form></section>
<section class="econ-card"><h2>💰 배당 선언</h2><p>배당 기준일·배당락일·지급일을 분리해 기록합니다. 지급은 관리자 또는 서버 스케줄러가 수행합니다.</p>
<form id="dividendForm" class="econ-form">
<label>종목<select name="stock_id">${stocks.map(s=>`<option value="${s.id}">${esc(s.name)} · ${esc(s.ticker)}</option>`).join("")}</select></label>
<label>주당 배당금<input name="dividend_per_share" type="number" min="1" value="1000" required></label>
<div class="econ-two"><label>배당 기준일<input name="record_date" type="date" required></label><label>배당락일<input name="ex_dividend_date" type="date" required></label></div>
<label>지급일<input name="payment_date" type="date" required></label>
<div class="econ-action"><button class="primary" type="submit">배당 선언</button></div></form>
<div class="econ-note">배당은 주주에게 실제 현금흐름을 만들어 주는 시스템입니다. 일반적인 시장에서도 record/ex-dividend/payment 날짜를 구분합니다.</div></section>
</div>
<section class="econ-card" style="margin-top:18px"><h2>📅 배당 지급 관리</h2><p>선언된 배당 중 지급일이 지난 항목을 확인하고 지급 처리합니다.</p><div class="econ-table" id="dividendTable">불러오는 중…</div></section>
<section class="econ-card" style="margin-top:18px"><h2>📉 공매도 현황</h2><p>공매도 포지션은 별도 증거금으로 관리됩니다.</p><div class="econ-table" id="shortTable">불러오는 중…</div></section>
</div>`;
$("#financialForm").onsubmit=saveFinancial;$("#dividendForm").onsubmit=saveDividend;await loadTables();
}
async function saveFinancial(e){e.preventDefault();const f=new FormData(e.target);try{const {data,error}=await sb.rpc("admin_record_dori_financials",{p_stock_id:Number(f.get("stock_id")),p_period_label:f.get("period_label").trim(),p_period_end:f.get("period_end"),p_revenue:Number(f.get("revenue")),p_operating_profit:Number(f.get("operating_profit")),p_net_profit:Number(f.get("net_profit")),p_eps:Number(f.get("eps")),p_revenue_growth:Number(f.get("revenue_growth")||0),p_profit_growth:Number(f.get("profit_growth")||0),p_guidance:f.get("guidance")||null,p_comment:f.get("comment")||null});if(error)throw error;toast("기업 실적이 저장되고 기준가에 반영되었습니다.");e.target.reset();}catch(err){toast(err.message||"실적 저장 실패",false)}}
async function saveDividend(e){e.preventDefault();const f=new FormData(e.target);try{const {error}=await sb.rpc("admin_declare_dori_dividend",{p_stock_id:Number(f.get("stock_id")),p_dividend_per_share:Number(f.get("dividend_per_share")),p_record_date:f.get("record_date"),p_ex_dividend_date:f.get("ex_dividend_date"),p_payment_date:f.get("payment_date")});if(error)throw error;toast("배당이 선언되었습니다.");await loadTables();}catch(err){toast(err.message||"배당 선언 실패",false)}}
async function loadTables(){const [d,s]=await Promise.all([sb.from("dori_stock_dividends").select("*,dori_stocks(name,ticker)").order("payment_date",{ascending:false}),sb.from("dori_stock_short_positions").select("*,dori_stocks(name,ticker)").order("opened_at",{ascending:false}).limit(100)]);if(d.error)throw d.error;if(s.error)throw s.error;$("#dividendTable").innerHTML=d.data?.length?`<table><thead><tr><th>종목</th><th>주당</th><th>기준일</th><th>지급일</th><th>상태</th><th></th></tr></thead><tbody>${d.data.map(x=>`<tr><td>${esc(x.dori_stocks?.name||"-")} · ${esc(x.dori_stocks?.ticker||"")}</td><td>${Number(x.dividend_per_share).toLocaleString()}</td><td>${esc(x.record_date)}</td><td>${esc(x.payment_date)}</td><td>${esc(x.status)}</td><td>${x.status==="DECLARED"?`<button class="secondary" onclick="payDividend(${x.id})">지급 처리</button>`:"-"}</td></tr>`).join("")}</tbody></table>`:"배당 기록이 없습니다.";$("#shortTable").innerHTML=s.data?.length?`<table><thead><tr><th>종목</th><th>수량</th><th>진입가</th><th>상태</th><th>P/L</th></tr></thead><tbody>${s.data.map(x=>`<tr><td>${esc(x.dori_stocks?.name||"-")}</td><td>${Number(x.quantity).toLocaleString()}주</td><td>${Number(x.entry_price).toLocaleString()}</td><td>${esc(x.status)}</td><td class="${Number(x.realized_pnl||0)>=0?"econ-positive":"econ-danger"}">${Number(x.realized_pnl||0).toLocaleString()}</td></tr>`).join("")}</tbody></table>`:"공매도 기록이 없습니다."}
async function payDividend(id){if(!confirm("이 배당을 지금 지급할까요?"))return;try{const {data,error}=await sb.rpc("admin_pay_dori_dividend",{p_dividend_id:Number(id)});if(error)throw error;toast("배당 지급 완료: "+Number(data?.total_paid||0).toLocaleString()+" 돌돌코인");await loadTables();}catch(err){toast(err.message||"배당 지급 실패",false)}}
(async()=>{try{await requireAdmin();await render()}catch(err){$("#econApp").innerHTML=`<div class="auth-error"><div>⚠️</div><h1>경제 관리자를 열 수 없습니다.</h1><p>${esc(err.message||"관리자 인증 실패")}</p><a class="primary" href="./index.html">관리자 센터</a></div>`}})();