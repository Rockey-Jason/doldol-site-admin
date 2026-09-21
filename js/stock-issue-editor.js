const cfg = window.DORI_ADMIN_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);

const STOCKS = [
  {
    id: null,
    ticker: "ROCKY",
    name: "로키 페이퍼",
    icon: "📰",
    tone: "안정형",
    description: "돌이신문을 운영하는 종목으로, 비교적 안정적인 움직임을 보입니다.",
    ranges: [
      ["일반 호재", "+0.5% ~ +3%"],
      ["강한 호재", "+3% ~ +7%"],
      ["일반 악재", "−0.5% ~ −3%"],
      ["강한 악재", "−3% ~ −7%"]
    ]
  },
  {
    id: null,
    ticker: "DORI_SEMI",
    name: "돌이 반도체",
    icon: "◈",
    tone: "고변동",
    description: "돌이 AI용 반도체 수요와 기술 이슈에 민감하게 반응합니다.",
    ranges: [
      ["AI 수요 증가", "+5% ~ +15%"],
      ["대형 기술 호재", "+15% ~ +30%"],
      ["공급·기술 악재", "−5% ~ −15%"],
      ["심각한 악재", "−15% ~ −30%"]
    ]
  },
  {
    id: null,
    ticker: "ROCKY_DORONIUM",
    name: "로키 도로늄",
    icon: "◆",
    tone: "테마형",
    description: "도로늄 품질과 생산, 인기 변화에 따라 움직임이 커질 수 있습니다.",
    ranges: [
      ["품질·생산 호재", "+3% ~ +10%"],
      ["대형 발견·인기 급증", "+10% ~ +25%"],
      ["품질·생산 악재", "−3% ~ −10%"],
      ["인기 급락", "−10% ~ −25%"]
    ]
  },
  {
    id: null,
    ticker: "DORI_ELECTRONICS",
    name: "돌이 전자",
    icon: "▣",
    tone: "안정 성장형",
    description: "전자제품 판매와 신제품 성과에 따라 비교적 완만하게 변동합니다.",
    ranges: [
      ["신제품·판매 호조", "+2% ~ +6%"],
      ["대형 성공", "+6% ~ +10%"],
      ["판매 부진", "−2% ~ −6%"],
      ["품질 이슈", "−6% ~ −10%"]
    ]
  },
  {
    id: null,
    ticker: "ROCKY_FOOD",
    name: "로키 푸드",
    icon: "●",
    tone: "소비 반응형",
    description: "돌이의 만족도와 식품 인기도에 따라 상승·하락 폭이 달라집니다.",
    ranges: [
      ["돌이 만족", "+4% ~ +10%"],
      ["대형 유행", "+10% ~ +20%"],
      ["만족도 하락", "−4% ~ −10%"],
      ["심각한 소비 악재", "−10% ~ −20%"]
    ]
  },
  {
    id: null,
    ticker: "DORI_APPAREL",
    name: "돌이 의류",
    icon: "◇",
    tone: "패션 민감형",
    description: "유행의 진입·확산·소멸에 가장 민감하게 반응하도록 설계합니다.",
    ranges: [
      ["유행 진입", "+5% ~ +15%"],
      ["대유행", "+15% ~ +30%"],
      ["유행 하락", "−5% ~ −15%"],
      ["급격한 외면", "−15% ~ −30%"]
    ]
  }
];

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function toast(msg, ok = true) {
  const e = $("#toast");
  if (!e) return;
  e.textContent = msg;
  e.className = ok ? "show ok" : "show";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => e.className = "", 3000);
}

async function requireAdmin() {
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session?.user) {
    throw new Error("관리자 로그인 세션이 없습니다.");
  }

  const { data: profile, error: profileError } = await sb
    .from("users")
    .select("is_admin,user_level,name")
    .eq("user_id", String(data.session.user.id))
    .single();

  if (profileError) throw profileError;

  if (profile?.is_admin !== true || Number(profile.user_level || 0) < 10) {
    throw new Error("관리자 권한이 없습니다.");
  }
}

async function loadStocks() {
  const { data, error } = await sb
    .from("dori_stocks")
    .select("id,ticker,name,current_price,is_active")
    .in("ticker", STOCKS.map(x => x.ticker))
    .eq("is_active", true);

  if (error) throw error;

  const map = new Map((data || []).map(x => [x.ticker, x]));

  for (const stock of STOCKS) {
    const row = map.get(stock.ticker);
    if (!row) {
      throw new Error(`${stock.name}(${stock.ticker}) 종목을 찾을 수 없습니다.`);
    }
    stock.id = row.id;
    stock.current_price = row.current_price;
  }
}

function render() {
  $("#editorApp").innerHTML = `
    <div class="special-shell editor-only-shell issue-editor-shell">
      <header class="special-head">
        <div>
          <button class="back-link" id="back">← 돌이 이슈 목록</button>
          <span class="eyebrow">DORI ISSUE / CREATE</span>
          <h1>📈 돌이 이슈 생성</h1>
          <p>이슈 내용과 6개 종목의 증감률을 정하면, 생성과 동시에 돌돌증권에 반영됩니다.</p>
        </div>
        <div class="editor-badge">MARKET EVENT</div>
      </header>

      <form id="issueForm" class="professional-form">
        <section class="edit-card issue-content-card">
          <div class="edit-card-head">
            <span class="round-icon">📰</span>
            <div>
              <h2>이슈 내용</h2>
              <small>돌이 세계에서 실제로 발생한 상황을 구체적으로 기록하세요.</small>
            </div>
          </div>
          <div class="form-grid">
            <label>이슈 제목
              <input name="title" maxlength="120" placeholder="예: 돌이 AI의 신규 반도체 공정 공개" required>
            </label>
            <div class="issue-live-note">
              <span>발행 방식</span>
              <b>즉시 발행 · 즉시 주가 반영</b>
              <small>6개 종목의 영향률은 하나의 거래로 묶여 저장됩니다.</small>
            </div>
          </div>
          <label>이슈 본문
            <textarea name="content" rows="8" maxlength="5000" placeholder="이슈의 발생 배경, 핵심 내용, 시장에 미칠 수 있는 영향을 입력하세요." required></textarea>
          </label>
        </section>

        <section class="edit-card stock-impact-card">
          <div class="edit-card-head">
            <span class="round-icon">📊</span>
            <div>
              <h2>종목별 시장 영향</h2>
              <small>모든 종목에 증감률을 입력해야 이슈를 생성할 수 있습니다.</small>
            </div>
          </div>
          <div id="stockImpactGrid" class="stock-impact-grid"></div>
        </section>

        <section class="range-guide">
          <div class="range-guide-head">
            <div>
              <span class="eyebrow">SCENARIO GUIDE</span>
              <h2>종목별 상황별 권장 증감 범위</h2>
              <p>아래 범위는 이슈의 강도에 맞춰 숫자를 고르기 위한 운영 기준입니다. 실제 입력은 ±50% 이내에서 가능합니다.</p>
            </div>
            <span class="range-guide-badge">6 STOCKS / GUIDELINE</span>
          </div>
          <div id="rangeGrid" class="range-grid"></div>
        </section>

        <div class="sticky-actions issue-sticky-actions">
          <div class="issue-submit-summary">
            <b id="issueReadyText">6개 종목의 증감률을 입력하세요.</b>
            <small id="issueReadySub">권장 범위를 벗어나면 저장 전에 안내합니다.</small>
          </div>
          <div class="editor-actions">
            <button type="button" class="secondary" id="cancel">취소</button>
            <button type="submit" class="primary editor-main-btn" id="save">📈 이슈 생성 및 발행</button>
          </div>
        </div>
      </form>
    </div>
  `;

  renderStockInputs();
  renderRangeGuide();

  $("#back").onclick = $("#cancel").onclick = () => {
    location.href = "./index.html#issues";
  };

  $("#issueForm").onsubmit = save;
  document.querySelectorAll(".impact-input").forEach(input => {
    input.addEventListener("input", updateReadyState);
  });
  updateReadyState();
}

function renderStockInputs() {
  $("#stockImpactGrid").innerHTML = STOCKS.map((s, i) => `
    <article class="stock-impact-item" style="--delay:${i * 45}ms">
      <div class="stock-impact-head">
        <div class="stock-symbol">${esc(s.icon)}</div>
        <div>
          <b>${esc(s.name)}</b>
          <small>${esc(s.ticker)} · ${esc(s.tone)}</small>
        </div>
      </div>
      <p>${esc(s.description)}</p>
      <div class="impact-price">
        <span>현재가</span>
        <strong>${Number(s.current_price).toLocaleString()} 돌돌</strong>
      </div>
      <label class="impact-field">
        <span>이슈 영향률</span>
        <div class="impact-input-wrap">
          <input class="impact-input" data-ticker="${esc(s.ticker)}" type="number" step="0.1" min="-50" max="50" placeholder="0.0" required>
          <b>%</b>
        </div>
      </label>
      <div class="impact-preview" data-preview="${esc(s.ticker)}">
        입력 대기 · 현재가 유지
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".impact-input").forEach(input => {
    input.addEventListener("input", () => updatePreview(input));
  });
}

function updatePreview(input) {
  const stock = STOCKS.find(s => s.ticker === input.dataset.ticker);
  const pct = Number(input.value);
  const box = document.querySelector(`[data-preview="${CSS.escape(stock.ticker)}"]`);
  if (!box) return;

  if (!Number.isFinite(pct)) {
    box.textContent = "입력 대기 · 현재가 유지";
    box.className = "impact-preview";
    return;
  }

  const next = Math.max(1, Math.round(Number(stock.current_price) * (1 + pct / 100)));
  const diff = next - Number(stock.current_price);
  const sign = diff > 0 ? "+" : "";
  box.textContent = `예상 현재가 ${next.toLocaleString()} 돌돌 · ${sign}${diff.toLocaleString()}`;
  box.className = `impact-preview ${diff > 0 ? "up" : diff < 0 ? "down" : "flat"}`;
}

function updateReadyState() {
  const inputs = [...document.querySelectorAll(".impact-input")];
  const filled = inputs.filter(x => x.value !== "").length;
  const out = inputs.filter(x => x.value !== "" && (Number(x.value) < -50 || Number(x.value) > 50)).length;
  $("#issueReadyText").textContent =
    out ? "허용 범위를 벗어난 값이 있습니다." :
    filled === 6 ? "6개 종목의 영향률이 모두 입력되었습니다." :
    `${6 - filled}개 종목의 영향률을 더 입력하세요.`;
  $("#issueReadySub").textContent =
    out ? "각 영향률은 -50% ~ +50% 사이여야 합니다." :
    "권장 범위를 벗어나도 입력할 수 있지만, 이슈 강도에 맞는 범위를 확인하세요.";
}

function renderRangeGuide() {
  $("#rangeGrid").innerHTML = STOCKS.map(s => `
    <article class="range-card">
      <div class="range-card-title">
        <span>${esc(s.icon)}</span>
        <div><b>${esc(s.name)}</b><small>${esc(s.ticker)} · ${esc(s.tone)}</small></div>
      </div>
      <p>${esc(s.description)}</p>
      <div class="range-list">
        ${s.ranges.map(r => `
          <div class="range-row">
            <span>${esc(r[0])}</span>
            <strong>${esc(r[1])}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");
}

async function save(e) {
  e.preventDefault();

  const title = $("#issueForm [name=title]").value.trim();
  const content = $("#issueForm [name=content]").value.trim();
  const inputs = [...document.querySelectorAll(".impact-input")];

  if (!title || !content) {
    toast("이슈 제목과 본문을 모두 입력하세요.", false);
    return;
  }

  if (inputs.length !== 6 || inputs.some(x => x.value === "")) {
    toast("6개 종목의 증감률을 모두 입력하세요.", false);
    return;
  }

  const impacts = inputs.map(input => {
    const stock = STOCKS.find(s => s.ticker === input.dataset.ticker);
    return {
      stock_id: Number(stock.id),
      ticker: stock.ticker,
      change_percent: Number(input.value)
    };
  });

  if (impacts.some(x => !Number.isFinite(x.change_percent) || x.change_percent < -50 || x.change_percent > 50)) {
    toast("증감률은 -50% ~ +50% 사이에서 입력하세요.", false);
    return;
  }

  const unusual = impacts.filter(x => {
    const stock = STOCKS.find(s => s.ticker === x.ticker);
    const n = Math.abs(x.change_percent);
    const normalMax = {
      ROCKY: 7, DORI_SEMI: 30, ROCKY_DORONIUM: 25,
      DORI_ELECTRONICS: 10, ROCKY_FOOD: 20, DORI_APPAREL: 30
    }[x.ticker];
    return n > normalMax;
  });

  const message = unusual.length
    ? `${unusual.map(x => STOCKS.find(s => s.ticker === x.ticker).name).join(", ")}의 영향률이 권장 범위를 넘어섰습니다.\n그래도 이슈를 생성할까요?`
    : "이슈를 생성하면 6개 종목의 현재가가 즉시 변경되고 가격 이력에 기록됩니다.\n계속하시겠습니까?";

  if (!confirm(message)) return;

  const button = $("#save");
  button.disabled = true;
  button.textContent = "발행 처리 중…";

  try {
    const { data, error } = await sb.rpc("admin_create_dori_stock_issue", {
      p_title: title,
      p_content: content,
      p_impacts: impacts
    });

    if (error) throw error;

    toast(`돌이 이슈 #${data}가 발행되었습니다.`);
    setTimeout(() => location.href = "./index.html#issues", 650);
  } catch (err) {
    console.error(err);
    button.disabled = false;
    button.textContent = "📈 이슈 생성 및 발행";
    toast(err.message || "이슈 생성에 실패했습니다.", false);
  }
}

(async () => {
  try {
    await requireAdmin();
    await loadStocks();
    render();
  } catch (err) {
    $("#editorApp").innerHTML = `
      <div class="auth-error">
        <div>⚠️</div>
        <h1>돌이 이슈 생성기를 열 수 없습니다.</h1>
        <p>${esc(err.message || "관리자 인증에 실패했습니다.")}</p>
        <a class="primary" href="./index.html#issues">돌이 이슈 목록</a>
      </div>
    `;
  }
})();
