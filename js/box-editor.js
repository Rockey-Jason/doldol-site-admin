const cfg = window.DORI_ADMIN_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

function toast(message, ok = true) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = ok ? "show ok" : "show";
  setTimeout(() => el.className = "", 2800);
}

async function requireAdmin() {
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session?.user) throw new Error("관리자 로그인 세션이 없습니다.");
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

function getId() {
  return new URLSearchParams(location.search).get("id");
}

async function load() {
  const id = getId();
  if (!id) {
    $("#editorApp").innerHTML = `<div class="auth-error"><div>🎁</div><h1>아이템이 선택되지 않았습니다.</h1><p>관리자 센터의 랜덤박스 목록에서 수정 버튼을 눌러 들어와 주세요.</p><a class="primary" href="./index.html">관리자 센터로 돌아가기</a></div>`;
    return;
  }

  const { data, error } = await sb
    .from("dori_box_item")
    .select("id,item_name,item_type,rarity,probability,reward_coins,item_code,created_at,reward_exp")
    .eq("id", id)
    .single();

  if (error) {
    $("#editorApp").innerHTML = `<div class="auth-error"><div>⚠️</div><h1>아이템을 불러오지 못했습니다.</h1><p>${esc(error.message)}</p><a class="primary" href="./index.html">목록으로 돌아가기</a></div>`;
    return;
  }

  $("#editorApp").innerHTML = `
    <div class="special-shell editor-only-shell">
      <header class="special-head">
        <div>
          <button class="back-link" id="back">← 랜덤박스 목록</button>
          <span class="eyebrow">RANDOM BOX / ITEM EDITOR</span>
          <h1>🎁 랜덤박스 아이템 수정</h1>
          <p>목록에서 선택한 아이템 <b>#${esc(data.id)}</b>만 편집합니다.</p>
        </div>
        <div class="editor-badge">EDIT MODE</div>
      </header>

      <div class="editor-layout">
        <section class="panel editor-main-card">
          <div class="editor-section-head"><div><span class="eyebrow">ITEM INFORMATION</span><h2>아이템 정보</h2></div><span class="id-chip">#${esc(data.id)}</span></div>
          <form id="boxForm" class="professional-form">
            <div class="form-grid two">
              <label>아이템 번호<input name="id" type="number" value="${esc(data.id)}" readonly></label>
              <label>아이템 이름<input name="item_name" required value="${esc(data.item_name)}"></label>
              <label>아이템 타입<input name="item_type" value="${esc(data.item_type)}" placeholder="예: cosmetic"></label>
              <label>등급<input name="rarity" value="${esc(data.rarity)}" placeholder="예: 일반 / 희귀 / 영웅 / 전설"></label>
              <label>아이템 코드<input name="item_code" value="${esc(data.item_code)}"></label>
              <label>확률 (%)<input name="probability" type="number" min="0" max="100" step="0.01" required value="${Number(data.probability || 0)}"></label>
              <label>보상 돌돌코인<input name="reward_coins" type="number" min="0" step="1" value="${Number(data.reward_coins || 0)}"></label>
              <label>보상 EXP<input name="reward_exp" type="number" min="0" step="1" value="${Number(data.reward_exp || 0)}"></label>
            </div>
            <div class="editor-info-grid">
              <div><span>현재 생성일</span><b>${esc(data.created_at ? new Date(data.created_at).toLocaleString("ko-KR") : "-" )}</b></div>
              <div><span>현재 확률</span><b>${Number(data.probability || 0).toFixed(2)}%</b></div>
            </div>
            <div class="form-help">확률은 0~100 사이에서 입력합니다. 저장 후 관리자 센터의 전체 확률 합계에서 100% 여부를 확인할 수 있습니다.</div>
            <div class="editor-actions"><button type="button" class="secondary" id="cancel">취소</button><button type="submit" class="primary" id="save">💾 변경사항 저장</button></div>
          </form>
        </section>
      </div>
    </div>`;

  $("#back").onclick = () => location.href = "./index.html#box";
  $("#cancel").onclick = () => location.href = "./index.html#box";
  $("#boxForm").onsubmit = save;
}

async function save(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const payload = {
    item_name: form.item_name.value.trim(),
    item_type: form.item_type.value.trim() || null,
    rarity: form.rarity.value.trim() || null,
    probability: Number(form.probability.value),
    reward_coins: Number(form.reward_coins.value || 0),
    item_code: form.item_code.value.trim() || null,
    reward_exp: Number(form.reward_exp.value || 0)
  };
  if (!payload.item_name || !Number.isFinite(payload.probability) || payload.probability < 0 || payload.probability > 100 || !Number.isInteger(payload.reward_coins) || payload.reward_coins < 0 || !Number.isInteger(payload.reward_exp) || payload.reward_exp < 0) {
    toast("입력값을 확인해 주세요.", false);
    return;
  }
  const button = $("#save");
  button.disabled = true;
  button.textContent = "저장 중…";
  const { error } = await sb.from("dori_box_item").update(payload).eq("id", getId());
  if (error) {
    button.disabled = false;
    button.textContent = "💾 변경사항 저장";
    toast(error.message, false);
    return;
  }
  toast("랜덤박스 아이템이 저장되었습니다.");
  setTimeout(() => location.href = "./index.html#box", 500);
}

(async () => {
  try { await requireAdmin(); await load(); }
  catch (e) {
    $("#editorApp").innerHTML = `<div class="auth-error"><div>🛡️</div><h1>관리자 인증이 필요합니다.</h1><p>${esc(e.message)}</p><a class="primary" href="./index.html">관리자 센터로 돌아가기</a></div>`;
  }
})();
