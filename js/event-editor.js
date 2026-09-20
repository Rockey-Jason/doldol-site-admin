const cfg = window.DORI_ADMIN_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

function toast(message, ok = true) {
  const el = $("#toast"); if (!el) return;
  el.textContent = message; el.className = ok ? "show ok" : "show";
  setTimeout(() => el.className = "", 2800);
}

async function requireAdmin() {
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session?.user) throw new Error("관리자 로그인 세션이 없습니다.");
  const { data: profile, error: profileError } = await sb.from("users").select("is_admin,user_level,name").eq("user_id", String(data.session.user.id)).single();
  if (profileError) throw profileError;
  if (profile?.is_admin !== true || Number(profile.user_level || 0) < 10) throw new Error("관리자 권한이 없습니다.");
}

function getNumber() { return new URLSearchParams(location.search).get("news_number"); }

async function load() {
  const number = getNumber();
  if (!number) {
    $("#editorApp").innerHTML = `<div class="auth-error"><div>🎉</div><h1>이벤트가 선택되지 않았습니다.</h1><p>관리자 센터의 이벤트 목록에서 수정 버튼을 눌러 들어와 주세요.</p><a class="primary" href="./index.html">관리자 센터로 돌아가기</a></div>`;
    return;
  }
  const { data, error } = await sb.from("rockey_news_events").select("news_number,enabled,event_name,description,reward_coins").eq("news_number", number).single();
  if (error) {
    $("#editorApp").innerHTML = `<div class="auth-error"><div>⚠️</div><h1>이벤트를 불러오지 못했습니다.</h1><p>${esc(error.message)}</p><a class="primary" href="./index.html#events">목록으로 돌아가기</a></div>`;
    return;
  }

  $("#editorApp").innerHTML = `
    <div class="special-shell editor-only-shell">
      <header class="special-head">
        <div>
          <button class="back-link" id="back">← 이벤트 목록</button>
          <span class="eyebrow">EVENT / EDITOR</span>
          <h1>🎉 이벤트 수정</h1>
          <p><b>#${esc(data.news_number)}</b> 이벤트만 편집합니다.</p>
        </div>
        <div class="editor-badge">EDIT MODE</div>
      </header>
      <div class="editor-layout">
        <section class="panel editor-main-card">
          <div class="editor-section-head"><div><span class="eyebrow">EVENT INFORMATION</span><h2>이벤트 정보</h2></div><span class="id-chip">#${esc(data.news_number)}</span></div>
          <form id="eventForm" class="professional-form">
            <div class="form-grid two">
              <label>이벤트 번호<input name="news_number" type="number" value="${esc(data.news_number)}" readonly></label>
              <label>이벤트 이름<input name="event_name" required value="${esc(data.event_name)}"></label>
            </div>
            <label>이벤트 설명<textarea name="description" rows="10" placeholder="이벤트의 내용과 조건을 입력하세요.">${esc(data.description)}</textarea></label>
            <label class="toggle-line professional-toggle"><input name="enabled" type="checkbox" ${data.enabled ? "checked" : ""}><span><b>이벤트 활성화</b><small>활성화하면 해당 이벤트를 사용할 수 있는 상태로 유지합니다.</small></span></label>
            <label>보상 돌돌코인<input name="reward_coins" type="number" min="0" step="1" value="${Number(data.reward_coins || 0)}"></label>
            <div class="editor-actions"><button type="button" class="secondary" id="cancel">취소</button><button type="submit" class="primary" id="save">💾 변경사항 저장</button></div>
          </form>
        </section>
      </div>
    </div>`;
  $("#back").onclick = () => location.href = "./index.html#events";
  $("#cancel").onclick = () => location.href = "./index.html#events";
  $("#eventForm").onsubmit = save;
}

async function save(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const payload = {
    event_name: form.event_name.value.trim(),
    description: form.description.value.trim(),
    enabled: form.enabled.checked,
    reward_coins: Number(form.reward_coins.value || 0)
  };
  if (!payload.event_name || !Number.isInteger(payload.reward_coins) || payload.reward_coins < 0) { toast("입력값을 확인해 주세요.", false); return; }
  const button = $("#save"); button.disabled = true; button.textContent = "저장 중…";
  const { error } = await sb.from("rockey_news_events").update(payload).eq("news_number", getNumber());
  if (error) { button.disabled = false; button.textContent = "💾 변경사항 저장"; toast(error.message, false); return; }
  toast("이벤트가 저장되었습니다.");
  setTimeout(() => location.href = "./index.html#events", 500);
}

(async () => {
  try { await requireAdmin(); await load(); }
  catch (e) { $("#editorApp").innerHTML = `<div class="auth-error"><div>🛡️</div><h1>관리자 인증이 필요합니다.</h1><p>${esc(e.message)}</p><a class="primary" href="./index.html">관리자 센터로 돌아가기</a></div>`; }
})();
