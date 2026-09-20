const cfg = window.DORI_ADMIN_CONFIG || {};

const sb = supabase.createClient(
  cfg.SUPABASE_URL,
  cfg.SUPABASE_ANON_KEY
);

const $ = s => document.querySelector(s);

const content = $("#content");

const state = {
  user: null,
  profile: null,
  page: "dashboard",
  selected: new Set(),

  /*
   * CRUD 페이지에서 현재 표시 중인 데이터를
   * HTML onclick 속성에 JSON으로 직접 넣지 않기 위한 저장소
   */
  crudRows: [],
  crudTable: null,
  crudCols: []
};

const VERIFIED_KEY = "dori_admin_verified_until";


/* =====================================================
   기본 유틸
===================================================== */

function toast(msg, ok = true) {
  const e = $("#toast");

  if (!e) return;

  e.textContent = msg;
  e.className = ok ? "show ok" : "show";

  setTimeout(() => {
    e.className = "";
  }, 2800);
}


/* =====================================================
   HTML Escape
===================================================== */

function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    m =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[m])
  );
}


/* =====================================================
   날짜 표시
===================================================== */

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "—";
  }

  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}


/* =====================================================
   숫자 안전 처리
===================================================== */

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}


/* =====================================================
   관리자 인증 상태
===================================================== */

function isVerified() {
  return Number(
    localStorage.getItem(VERIFIED_KEY) || 0
  ) > Date.now();
}


function setVerified(minutes = 30) {
  localStorage.setItem(
    VERIFIED_KEY,
    String(
      Date.now() +
      minutes * 60 * 1000
    )
  );
}


function clearVerified() {
  localStorage.removeItem(
    VERIFIED_KEY
  );
}


/* =====================================================
   현재 Supabase 로그인 사용자
===================================================== */

async function currentUser() {
  const {
    data: { session },
    error
  } = await sb.auth.getSession();

  if (error) {
    console.error(
      "세션 확인 오류:",
      error
    );

    return null;
  }

  return session?.user ?? null;
}


/* =====================================================
   관리자 프로필 확인
===================================================== */

async function loadProfile(user) {
  if (!user?.id) {
    throw new Error(
      "로그인 사용자를 확인할 수 없습니다."
    );
  }

  const {
    data,
    error
  } = await sb
    .from("users")
    .select("*")
    .eq(
      "user_id",
      String(user.id)
    )
    .single();

  if (error) {
    throw error;
  }

  if (
    data.is_admin !== true ||
    Number(data.user_level || 0) < 10
  ) {
    throw new Error(
      "관리자 권한이 없습니다."
    );
  }

  state.user = user;
  state.profile = data;

  const adminName = $("#adminName");

  if (adminName) {
    adminName.textContent =
      ` · ${
        data.name ||
        data.login_id ||
        user.email ||
        ""
      }`;
  }
}


/* =====================================================
   login_id → 이메일 조회
===================================================== */

async function resolveEmail(loginId) {
  if (!cfg.ADMIN_LOGIN_LOOKUP_URL) {
    throw new Error(
      "ADMIN_LOGIN_LOOKUP_URL을 설정하세요."
    );
  }

  const response = await fetch(
    cfg.ADMIN_LOGIN_LOOKUP_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "apikey":
          cfg.SUPABASE_ANON_KEY
      },

      body: JSON.stringify({
        login_id: loginId
      })
    }
  );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      text ||
      "관리자 계정을 확인할 수 없습니다."
    );
  }

  const data =
    await response.json();

  if (!data.email) {
    throw new Error(
      "관리자 이메일을 확인할 수 없습니다."
    );
  }

  return data.email;
}


/* =====================================================
   관리자 이메일 인증 요청
===================================================== */

async function requestEmailVerification() {
  if (!cfg.VERIFY_EMAIL_FUNCTION_URL) {
    throw new Error(
      "VERIFY_EMAIL_FUNCTION_URL을 설정하세요."
    );
  }

  const {
    data: { session },
    error: sessionError
  } = await sb.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.access_token) {
    throw new Error(
      "로그인 세션을 찾을 수 없습니다."
    );
  }

  const response = await fetch(
    cfg.VERIFY_EMAIL_FUNCTION_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "Authorization":
          `Bearer ${session.access_token}`,

        "apikey":
          cfg.SUPABASE_ANON_KEY
      },

      body: JSON.stringify({})
    }
  );

  let body = null;

  try {
    body = await response.json();
  } catch (_) {}

  if (!response.ok) {
    throw new Error(
      body?.message ||
      body?.error ||
      "인증 이메일 발송에 실패했습니다."
    );
  }

  return body;
}


/* =====================================================
   관리자 로그인
===================================================== */

async function signIn(
  loginId,
  password
) {
  const id =
    String(loginId || "")
      .trim();

  const pw =
    String(password || "");

  if (!id) {
    throw new Error(
      "계정 아이디를 입력하세요."
    );
  }

  if (!pw) {
    throw new Error(
      "계정 비밀번호를 입력하세요."
    );
  }

  clearVerified();


  /* ---------------------------------------------------
     1. login_id 확인
  --------------------------------------------------- */

  $("#authStatus").textContent =
    "관리자 계정을 확인하는 중…";

  const email =
    await resolveEmail(id);


  /* ---------------------------------------------------
     2. Supabase 비밀번호 로그인
  --------------------------------------------------- */

  $("#authStatus").textContent =
    "비밀번호를 확인하는 중…";

  const {
    data,
    error
  } =
    await sb.auth.signInWithPassword({
      email,
      password: pw
    });

  if (error) {
    throw error;
  }

  if (!data?.user) {
    throw new Error(
      "로그인 사용자를 확인할 수 없습니다."
    );
  }


  /* ---------------------------------------------------
     3. 관리자 권한 확인
  --------------------------------------------------- */

  $("#authStatus").textContent =
    "관리자 권한을 확인하는 중…";

  await loadProfile(
    data.user
  );


  /* ---------------------------------------------------
     4. 이메일 인증 링크 발송
  --------------------------------------------------- */

  $("#authStatus").textContent =
    "관리자 이메일 인증 메일을 보내는 중…";

  await requestEmailVerification();


  /* ---------------------------------------------------
     5. 이메일 인증 대기
  --------------------------------------------------- */

  $("#authStatus").textContent =
    "인증 메일을 확인해 주세요. 이메일의 인증 링크를 열면 관리자 사이트에 로그인됩니다.";
}


/* =====================================================
   관리자 사이트 시작
===================================================== */

async function boot() {
  try {
    const {
      data: { session },
      error
    } =
      await sb.auth.getSession();

    if (error) {
      throw error;
    }

    const user =
      session?.user ?? null;


    /* ---------------------------------------------------
       Supabase 세션이 존재하는 경우
    --------------------------------------------------- */

    if (user) {
      await loadProfile(user);

      setVerified(30);

      showApp();

      const hashPage = location.hash.replace("#", "").trim();
      const allowedPages = new Set(["dashboard","users","news","quiz","box","events","stats","logs","security"]);
      render(allowedPages.has(hashPage) ? hashPage : "dashboard");

      return;
    }


    /* ---------------------------------------------------
       세션이 없는 경우
    --------------------------------------------------- */

    clearVerified();

  } catch (error) {
    console.error(
      "관리자 boot 오류:",
      error
    );

    await sb.auth
      .signOut()
      .catch(() => {});

    clearVerified();

    const authStatus =
      $("#authStatus");

    if (authStatus) {
      authStatus.textContent =
        error?.message ||
        "관리자 인증에 실패했습니다.";
    }
  }
}


/* =====================================================
   관리자 앱 표시
===================================================== */

function showApp() {
  $("#authGate")
    ?.classList
    .add("hidden");

  $("#app")
    ?.classList
    .remove("hidden");
}


/* =====================================================
   페이지 렌더링
===================================================== */

function render(page) {
  state.page = page;

  state.selected.clear();

  /*
   * 다른 페이지로 이동하면
   * 이전 CRUD 데이터는 폐기한다.
   */
  state.crudRows = [];
  state.crudTable = null;
  state.crudCols = [];

  document
    .querySelectorAll("#nav button")
    .forEach(b =>
      b.classList.toggle(
        "active",
        b.dataset.page === page
      )
    );

  const navButton =
    document.querySelector(
      `#nav button[data-page="${page}"]`
    );

  $("#pageTitle").textContent =
    navButton?.textContent.trim() ||
    "관리";

  const pages = {
    dashboard,
    users,
    news,
    quiz,
    box,
    events,
    stats,
    logs,
    security
  };

  const pageFunction =
    pages[page] || dashboard;

  pageFunction();
}


/* =====================================================
   테이블 개수
===================================================== */

async function count(table) {
  const {
    count,
    error
  } = await sb
    .from(table)
    .select("*", {
      count: "exact",
      head: true
    });

  if (error) {
    console.error(
      `${table} count 오류:`,
      error
    );

    return 0;
  }

  return count || 0;
}


/* =====================================================
   대시보드
===================================================== */

async function dashboard() {
  content.innerHTML = `
    <div class="hero">

      <h1>
        돌이 관리자 센터 🐶
      </h1>

      <p>
        사이트의 핵심 데이터를 한 곳에서 관리하세요.
      </p>

    </div>

    <div
      class="grid cards"
      id="cards"
    ></div>

    <div class="panel">

      <h2>
        최근 활동
      </h2>

      <div id="recent">
        불러오는 중...
      </div>

    </div>
  `;

  const [
    usersCount,
    newsCount,
    itemsCount,
    eventsCount
  ] =
    await Promise.all([
      count("users"),
      count("rockey_news"),
      count("dori_box_item"),
      count("rockey_news_events")
    ]);

  $("#cards").innerHTML = [

    [
      "회원",
      usersCount,
      "👥"
    ],

    [
      "신문",
      newsCount,
      "📰"
    ],

    [
      "랜덤박스 아이템",
      itemsCount,
      "🎁"
    ],

    [
      "이벤트",
      eventsCount,
      "🎉"
    ]

  ]
    .map(x => `
      <div class="stat-card">

        <span>
          ${x[2]}
        </span>

        <b>
          ${safeNumber(
            x[1]
          ).toLocaleString()}
        </b>

        <small>
          ${esc(x[0])}
        </small>

      </div>
    `)
    .join("");

  await recent();
}


/* =====================================================
   최근 활동
===================================================== */

async function recent() {
  const {
    data,
    error
  } =
    await sb
      .from("admin_logs")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(10);

  if (error) {
    $("#recent").innerHTML = `
      <div class="empty">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  $("#recent").innerHTML =
    data?.length

      ? data
          .map(
            l => `
              <div class="row">

                <span>
                  ${esc(l.action)}
                </span>

                <small>
                  ${esc(
                    formatDate(
                      l.created_at
                    )
                  )}
                </small>

              </div>
            `
          )
          .join("")

      : "기록이 없습니다.";
}


/* =====================================================
   회원 관리
===================================================== */

async function users() {
  content.innerHTML = `
    <div class="toolbar">

      <input
        id="userSearch"
        placeholder="아이디/이름/회원번호 검색"
      >

      <button
        class="secondary"
        id="reload"
      >
        새로고침
      </button>

      <button
        class="primary"
        id="bulk"
      >
        선택 회원 일괄 지급
      </button>

    </div>

    <div class="panel">

      <div id="userTable">
        불러오는 중...
      </div>

    </div>
  `;

  $("#reload").onclick =
    users;

  $("#bulk").onclick =
    bulkReward;

  $("#userSearch").oninput =
    () =>
      loadUsers(
        $("#userSearch").value
      );

  await loadUsers("");
}


/* =====================================================
   회원 불러오기
===================================================== */

async function loadUsers(q) {
  const search =
    String(q || "").trim();

  const {
    data,
    error
  } =
    await sb.rpc(
      "admin_list_users",
      {
        p_search:
          search || null,

        p_limit:
          500,

        p_offset:
          0
      }
    );

  if (error) {
    console.error(
      "회원 목록 조회 오류:",
      error
    );

    $("#userTable").innerHTML = `
      <div class="empty">

        <b>
          회원 목록을 불러오지 못했습니다.
        </b>

        <br>

        <small>
          ${esc(error.message)}
        </small>

        <br><br>

        <small>
          Supabase SQL의
          admin_list_users()
          함수가 배포되어 있는지 확인하세요.
        </small>

      </div>
    `;

    return;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  $("#userTable").innerHTML = `
    <table>

      <thead>

        <tr>

          <th>
            <input
              type="checkbox"
              id="all"
            >
          </th>

          <th>번호</th>
          <th>아이디</th>
          <th>이름</th>
          <th>Lv</th>
          <th>코인</th>
          <th>EXP</th>
          <th>권한</th>
          <th>Auth 상태</th>
          <th>최근 로그인</th>
          <th>조작</th>

        </tr>

      </thead>

      <tbody>

        ${
          rows.length

            ? rows
                .map(
                  u => {

                    const userJson =
                      JSON.stringify(u)
                        .replace(
                          /'/g,
                          "&#39;"
                        );

                    return `
                      <tr>

                        <td>
                          <input
                            type="checkbox"
                            class="sel"
                            data-id="${esc(u.user_id)}"
                          >
                        </td>

                        <td>
                          ${esc(u.user_number)}
                        </td>

                        <td>
                          ${esc(u.login_id)}
                        </td>

                        <td>
                          ${esc(u.name)}
                        </td>

                        <td>
                          Lv.${esc(u.user_level)}
                        </td>

                        <td>
                          ${safeNumber(
                            u.doldolcoin
                          ).toLocaleString()}
                        </td>

                        <td>
                          ${safeNumber(
                            u.exp
                          ).toLocaleString()}
                        </td>

                        <td>

                          <span
                            class="pill ${
                              u.is_admin
                                ? ""
                                : "muted"
                            }"
                          >

                            ${
                              u.is_admin
                                ? "관리자"
                                : "일반 회원"
                            }

                          </span>

                        </td>

                        <td>

                          ${
                            u.auth_user_id

                              ? (
                                  u.email_confirmed_at
                                    ? "인증됨"
                                    : "미인증"
                                )

                              : "Auth 없음"
                          }

                        </td>

                        <td>
                          ${esc(
                            formatDate(
                              u.last_sign_in_at
                            )
                          )}
                        </td>

                        <td>

                          <button
                            class="mini"
                            onclick='editUser(${userJson})'
                          >
                            수정
                          </button>

                        </td>

                      </tr>
                    `;
                  }
                )
                .join("")

            : `
              <tr>

                <td
                  colspan="11"
                  class="empty"
                >
                  조회된 회원이 없습니다.
                </td>

              </tr>
            `
        }

      </tbody>

    </table>
  `;


  const all =
    $("#all");

  if (all) {
    all.onchange =
      e => {

        document
          .querySelectorAll(".sel")
          .forEach(x => {

            x.checked =
              e.target.checked;

          });

      };
  }
}


/* =====================================================
   회원 수정
===================================================== */

function openSideEditor(title, html, onSave) {
  const root = $("#sideEditor");
  const body = $("#sideEditorBody");
  const titleEl = $("#sideEditorTitle");
  if (!root || !body) return;
  titleEl.textContent = title;
  body.innerHTML = html;
  root.classList.add("open");
  root.setAttribute("aria-hidden", "false");
  const form = body.querySelector("form");
  if (form) form.onsubmit = async e => { e.preventDefault(); await onSave(form); };
  body.querySelectorAll("[data-close-editor]").forEach(x => x.onclick = closeSideEditor);
  setTimeout(() => body.querySelector("input,select,textarea")?.focus(), 80);
}

function closeSideEditor() {
  const root = $("#sideEditor");
  if (!root) return;
  root.classList.remove("open");
  root.setAttribute("aria-hidden", "true");
}

window.editUser = async u => {
  const currentCoins = safeNumber(u.doldolcoin);
  const currentExp = safeNumber(u.exp);
  const currentLevel = safeNumber(u.user_level);
  openSideEditor(`회원 #${u.user_number ?? ""} 정보 수정`, `
    <div class="editor-user-summary"><div class="avatar">👤</div><div><b>${esc(u.name || u.login_id || "이름 없음")}</b><span>${esc(u.login_id || "")} · ${esc(u.email || "")}</span></div></div>
    <form class="quick-form">
      <label>돌돌코인<input name="coins" type="number" min="0" step="1" value="${currentCoins}"></label>
      <label>EXP<input name="exp" type="number" min="0" step="1" value="${currentExp}"></label>
      <label>회원 레벨<input name="level" type="number" min="1" max="10" step="1" value="${currentLevel}"></label>
      <div class="form-help">회원의 현재 잔액/EXP/등급을 한 번에 저장합니다.</div>
      <div class="quick-actions"><button type="button" class="secondary" data-close-editor>취소</button><button type="submit" class="primary">저장하기</button></div>
    </form>`, async form => {
      const coins=Number(form.coins.value), exp=Number(form.exp.value), level=Number(form.level.value);
      if(!Number.isInteger(coins)||coins<0||!Number.isInteger(exp)||exp<0||!Number.isInteger(level)||level<1||level>10){ toast("값을 정확히 확인하세요.",false); return; }
      const {error}=await sb.rpc("admin_update_user",{p_user_id:String(u.user_id),p_doldolcoin:coins,p_exp:exp,p_user_level:level});
      if(error){console.error(error);toast(error.message,false);return;}
      closeSideEditor(); toast("회원 정보가 수정되었습니다."); await loadUsers($("#userSearch")?.value||"");
    });
};

async function bulkReward() {
  const ids=[...document.querySelectorAll(".sel:checked")].map(x=>x.dataset.id);
  if(!ids.length) return toast("회원을 선택하세요.",false);
  openSideEditor(`${ids.length}명 일괄 지급`, `
    <div class="bulk-target"><span>👥</span><div><b>${ids.length}명</b><small>선택된 회원에게 동일한 금액을 지급합니다.</small></div></div>
    <form class="quick-form">
      <label>지급할 돌돌코인<input name="coins" type="number" min="1" step="1" value="1000"></label>
      <label>지급 사유<input name="reason" maxlength="100" value="관리자 일괄 지급"></label>
      <div class="quick-actions"><button type="button" class="secondary" data-close-editor>취소</button><button type="submit" class="primary">🪙 지급하기</button></div>
    </form>`, async form => {
      const coins=Number(form.coins.value), reason=String(form.reason.value||"").trim()||"관리자 일괄 지급";
      if(!Number.isInteger(coins)||coins<=0){toast("1 이상의 정수를 입력하세요.",false);return;}
      const button=form.querySelector('[type="submit"]'); button.disabled=true; button.textContent="지급 중…";
      for(const id of ids){ const {error}=await sb.rpc("admin_adjust_coins",{p_user_id:String(id),p_amount:coins,p_reason:reason}); if(error){button.disabled=false;button.textContent="🪙 지급하기";toast(error.message,false);return;} }
      closeSideEditor(); toast(`${ids.length}명에게 ${coins.toLocaleString()} 돌돌코인을 지급했습니다.`); await loadUsers($("#userSearch")?.value||"");
    });
}

/* =====================================================
   돌이신문 & 돌이퀴즈
===================================================== */

async function news() {
  newsCenter();
}

/* 기존 메뉴/호출 호환용 */
async function quiz() {
  newsCenter();
}

async function newsCenter() {
  content.innerHTML = `
    <div class="news-center-head">
      <div>
        <div class="eyebrow">CONTENT MANAGEMENT</div>
        <h1>📰 돌이신문 & 돌이퀴즈</h1>
        <p>신문과 퀴즈를 회차별로 한눈에 확인하고, 클릭 한 번으로 전문적인 편집 화면으로 이동합니다.</p>
      </div>
      <div class="news-head-actions">
        <button class="secondary" id="newsRefresh">↻ 새로고침</button>
        <button class="primary" id="newIssue">＋ 새 회차</button>
      </div>
    </div>

    <div class="news-summary" id="newsSummary"></div>

    <div class="news-toolbar">
      <div class="search-box">
        <span>⌕</span>
        <input id="newsSearch" placeholder="회차 번호 또는 신문/퀴즈 내용 검색">
      </div>
      <div class="news-filters">
        <button class="filter active" data-filter="all">전체</button>
        <button class="filter" data-filter="complete">신문 + 퀴즈</button>
        <button class="filter" data-filter="missing">퀴즈 미작성</button>
      </div>
    </div>

    <div class="panel news-panel">
      <div class="news-list-title">
        <div>
          <h2>회차 목록</h2>
          <span id="newsResultCount">불러오는 중…</span>
        </div>
        <span class="sort-label">번호순 ↑</span>
      </div>
      <div id="newsList" class="news-list">
        <div class="news-loading"><span></span><span></span><span></span> 데이터를 불러오는 중…</div>
      </div>
    </div>
  `;

  let rows = [];
  let filter = "all";

  const load = async () => {
    const list = $("#newsList");
    list.innerHTML = `<div class="news-loading"><span></span><span></span><span></span> 데이터를 불러오는 중…</div>`;

    const { data, error } = await sb
      .from("rockey_news")
      .select("news_number,rockey_news,question,question_type,choice1,choice2,choice3,choice4,choice5,answer")
      .limit(1000);

    if (error) {
      list.innerHTML = `<div class="empty news-error">${esc(error.message)}</div>`;
      return;
    }

    rows = (data || []).slice().sort((a,b) => {
      const an = Number(a.news_number), bn = Number(b.news_number);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a.news_number ?? "").localeCompare(String(b.news_number ?? ""), "ko");
    });

    renderNewsList();
  };

  const renderNewsList = () => {
    const q = String($("#newsSearch")?.value || "").trim().toLowerCase();
    const visible = rows.filter(r => {
      const quizReady = isQuizReady(r);
      const matchesFilter = filter === "all" || (filter === "complete" && quizReady) || (filter === "missing" && !quizReady);
      const haystack = [r.news_number, r.rockey_news, r.question, r.choice1, r.choice2, r.choice3, r.choice4, r.choice5].join(" ").toLowerCase();
      return matchesFilter && (!q || haystack.includes(q));
    });

    const complete = rows.filter(isQuizReady).length;
    const missing = rows.length - complete;
    $("#newsSummary").innerHTML = `
      <div class="summary-card"><span class="summary-icon">📰</span><div><b>${rows.length.toLocaleString()}</b><small>전체 회차</small></div></div>
      <div class="summary-card good"><span class="summary-icon">✓</span><div><b>${complete.toLocaleString()}</b><small>퀴즈 작성 완료</small></div></div>
      <div class="summary-card warn"><span class="summary-icon">!</span><div><b>${missing.toLocaleString()}</b><small>퀴즈 미작성</small></div></div>
    `;
    $("#newsResultCount").textContent = `${visible.length.toLocaleString()}개 표시`;

    if (!visible.length) {
      $("#newsList").innerHTML = `<div class="empty news-empty"><div>🔎</div><b>조건에 맞는 회차가 없습니다.</b><small>검색어나 필터를 바꿔보세요.</small></div>`;
      return;
    }

    $("#newsList").innerHTML = visible.map((r, index) => {
      const quizReady = isQuizReady(r);
      const number = esc(r.news_number ?? "—");
      const preview = String(r.rockey_news || "").replace(/\s+/g, " ").trim();
      const quizPreview = String(r.question || "").replace(/\s+/g, " ").trim();
      return `
        <button class="news-card ${quizReady ? "" : "is-missing"}" type="button" data-issue="${esc(r.news_number)}" style="--delay:${Math.min(index,14) * 25}ms">
          <div class="news-number"><span>#</span>${number}</div>
          <div class="news-main">
            <div class="news-card-title">${preview ? esc(preview) : "신문 내용이 아직 없습니다."}</div>
            <div class="news-card-meta">
              <span class="status-chip news-ok">📰 신문 ${preview ? "작성됨" : "미작성"}</span>
              <span class="status-chip ${quizReady ? "quiz-ok" : "quiz-missing"}">${quizReady ? "✓" : "!"} 퀴즈 ${quizReady ? "작성됨" : "미작성"}</span>
              ${quizPreview ? `<span class="quiz-preview">❓ ${esc(quizPreview)}</span>` : ""}
            </div>
          </div>
          <span class="news-arrow">›</span>
        </button>
      `;
    }).join("");

    document.querySelectorAll(".news-card").forEach(card => {
      card.onclick = () => {
        const issue = card.dataset.issue;
        window.location.href = `./editor.html?issue=${encodeURIComponent(issue)}`;
      };
    });
  };

  $("#newsRefresh").onclick = load;
  $("#newsSearch").oninput = renderNewsList;
  $("#newIssue").onclick = () => {
    const nums = rows.map(r => Number(r.news_number)).filter(Number.isFinite);
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    window.location.href = `./editor.html?issue=${next}&new=1`;
  };
  document.querySelectorAll(".news-filters .filter").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".news-filters .filter").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      filter = btn.dataset.filter;
      renderNewsList();
    };
  });

  await load();
}

function isQuizReady(row) {
  if (!row) return false;
  const question = String(row.question ?? "").trim();
  const answer = String(row.answer ?? "").trim();
  if (!question || !answer) return false;
  const choices = [1,2,3,4,5].map(n => String(row[`choice${n}`] ?? "").trim()).filter(Boolean);
  return choices.length > 0;
}


/* =====================================================
   공통 CRUD
===================================================== */

async function crudPage(
  title,
  table,
  cols
) {
  content.innerHTML = `
    <div class="toolbar">

      <button
        class="primary"
        id="add"
      >
        ＋ 새로 만들기
      </button>

      <button
        class="secondary"
        id="refresh"
      >
        새로고침
      </button>

    </div>

    <div class="panel">

      <h2>
        ${esc(title)}
      </h2>

      <div id="crud">
        불러오는 중...
      </div>

    </div>
  `;


  $("#add").onclick =
    () =>
      editRecord(
        table,
        cols,
        {}
      );


  $("#refresh").onclick =
    () =>
      crudPage(
        title,
        table,
        cols
      );


  const {
    data,
    error
  } =
    await sb
      .from(table)
      .select("*")
      .order(
        cols[0],
        {
          ascending: false
        }
      )
      .limit(200);


  if (error) {
    $("#crud")
      .textContent =
      error.message;

    return;
  }


  /*
   * ===================================================
   * 중요:
   *
   * 기존에는 여기에서:
   *
   * JSON.stringify(r)
   *
   * 를 onclick 안에 직접 넣고 있었다.
   *
   * 그 결과 특정 신문 본문에 따옴표/특수문자 등이
   * 포함되면 HTML 속성이 깨질 수 있었다.
   *
   * 이제 실제 row 객체는 state.crudRows에 보관하고
   * HTML에는 숫자 index만 넣는다.
   * ===================================================
   */

  state.crudRows =
    Array.isArray(data)
      ? data
      : [];

  state.crudTable =
    table;

  state.crudCols =
    cols;


  $("#crud").innerHTML =
    state.crudRows
      .map(
        (r, index) => `
          <div class="crud-row">

            <div>

              <b>
                ${esc(
                  r[cols[0]]
                )}
              </b>

              <span>
                ${esc(
                  r.rockey_news ||
                  r.question ||
                  ""
                )}
              </span>

            </div>

            <button
              class="mini crud-edit"
              type="button"
              data-index="${index}"
            >
              수정
            </button>

          </div>
        `
      )
      .join("") ||
    "데이터가 없습니다.";


  /*
   * ===================================================
   * 수정 버튼 이벤트 연결
   * ===================================================
   */

  document
    .querySelectorAll(".crud-edit")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const index =
            Number(
              button.dataset.index
            );

          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= state.crudRows.length
          ) {
            toast(
              "수정할 데이터를 찾을 수 없습니다.",
              false
            );

            return;
          }

          const row =
            state.crudRows[index];

          editRecord(
            state.crudTable,
            state.crudCols,
            row
          );

        }
      );

    });
}


/* =====================================================
   CRUD 레코드 수정
===================================================== */

window.editRecord =
  async (
    table,
    cols,
    row
  ) => {

    const payload = {};


    for (const c of cols) {

      const v =
        prompt(
          c,
          row[c] ?? ""
        );

      if (v === null) {
        return;
      }

      payload[c] =
        v;
    }


    const key =
      cols[0];


    let query;


    if (
      row[key] != null
    ) {

      query =
        sb
          .from(table)
          .update(payload)
          .eq(
            key,
            row[key]
          );

    } else {

      query =
        sb
          .from(table)
          .insert(payload);

    }


    const {
      error
    } =
      await query;


    if (error) {

      console.error(
        "저장 오류:",
        error
      );

      toast(
        error.message,
        false
      );

      return;
    }


    toast(
      "저장되었습니다."
    );


    await render(
      state.page
    );
  };


/* =====================================================
   랜덤박스 확률

   중요: 목록에서는 절대 편집 페이지로 자동 이동하지 않습니다.
   사용자가 "수정" 버튼을 눌렀을 때만 box-editor.html로 이동합니다.
===================================================== */

async function box() {
  content.innerHTML = `
    <div class="news-center-head">
      <div>
        <div class="eyebrow">RANDOM BOX MANAGEMENT</div>
        <h1>🎁 랜덤박스 확률</h1>
        <p>아이템 번호, 이름, 타입, 등급, 확률과 보상을 한눈에 확인합니다. 편집은 각 항목의 수정 버튼을 눌렀을 때만 별도 편집 페이지에서 진행됩니다.</p>
      </div>
      <div class="news-head-actions">
        <button class="secondary" id="boxRefresh">↻ 새로고침</button>
      </div>
    </div>

    <div class="news-summary" id="boxSummary"></div>

    <div class="news-toolbar">
      <div class="search-box">
        <span>⌕</span>
        <input id="boxSearch" placeholder="번호, 아이템 이름, 코드, 타입, 등급 검색">
      </div>
    </div>

    <div class="panel news-panel">
      <div class="news-list-title">
        <div><h2>아이템 목록</h2><span id="boxResultCount">불러오는 중…</span></div>
        <span class="sort-label">번호순 ↑</span>
      </div>
      <div id="boxList" class="special-main-list">불러오는 중...</div>
    </div>
  `;

  $("#boxRefresh").onclick = box;
  $("#boxSearch").oninput = () => renderBoxList(window.__doriBoxRows || []);

  const { data, error } = await sb
    .from("dori_box_item")
    .select("id,item_name,item_type,rarity,probability,reward_coins,item_code,created_at,reward_exp")
    .order("id", { ascending: true });

  if (error) {
    $("#boxList").innerHTML = `<div class="empty"><b>랜덤박스 아이템을 불러오지 못했습니다.</b><br><small>${esc(error.message)}</small></div>`;
    return;
  }

  window.__doriBoxRows = data || [];
  renderBoxList(window.__doriBoxRows);
}

function renderBoxList(rows) {
  const q = String($("#boxSearch")?.value || "").trim().toLowerCase();
  const filtered = rows.filter(r => [
    r.id, r.item_name, r.item_type, r.rarity, r.item_code,
    r.probability, r.reward_coins, r.reward_exp
  ].join(" ").toLowerCase().includes(q));

  const total = rows.reduce((sum, r) => sum + Number(r.probability || 0), 0);
  const complete = Math.abs(total - 100) < 0.000001;

  $("#boxSummary").innerHTML = `
    <div class="summary-card"><span class="summary-icon">🎁</span><div><b>${rows.length}</b><small>아이템</small></div></div>
    <div class="summary-card"><span class="summary-icon">%</span><div><b>${total.toFixed(2)}%</b><small>전체 확률</small></div></div>
    <div class="summary-card ${complete ? "good" : "warn"}"><span class="summary-icon">${complete ? "✓" : "!"}</span><div><b>${complete ? "100%" : "조정 필요"}</b><small>확률 검증</small></div></div>
  `;
  $("#boxResultCount").textContent = `${filtered.length}개 표시`;

  if (!filtered.length) {
    $("#boxList").innerHTML = `<div class="empty">조건에 맞는 랜덤박스 아이템이 없습니다.</div>`;
    return;
  }

  $("#boxList").innerHTML = `
    <div class="special-table-head box-grid">
      <span>번호</span><span>아이템</span><span>타입</span><span>등급</span><span>확률</span><span>보상</span><span></span>
    </div>
    ${filtered.map((r, i) => `
      <div class="special-table-row box-grid" style="--delay:${Math.min(i, 15) * 20}ms">
        <strong>#${esc(r.id)}</strong>
        <div class="item-cell"><span class="item-orb">🎁</span><span><b>${esc(r.item_name || "이름 없음")}</b><small>${esc(r.item_code || "코드 없음")}</small></span></div>
        <span>${esc(r.item_type || "-")}</span>
        <span class="grade-badge">${esc(r.rarity || "미설정")}</span>
        <span class="prob-value">${Number(r.probability || 0).toFixed(2)}%</span>
        <span class="reward-stack"><small>🪙 ${Number(r.reward_coins || 0).toLocaleString()}</small><small>⭐ ${Number(r.reward_exp || 0).toLocaleString()} EXP</small></span>
        <button class="mini primary" type="button" data-box-edit="${esc(r.id)}">수정</button>
      </div>
    `).join("")}
  `;

  document.querySelectorAll("[data-box-edit]").forEach(btn => {
    btn.onclick = () => {
      const id = encodeURIComponent(btn.dataset.boxEdit);
      window.location.href = `./box-editor.html?id=${id}`;
    };
  });
}

/* =====================================================
   이벤트

   목록에서 이벤트를 클릭하거나 자동 이동하지 않습니다.
   "수정" 버튼을 눌렀을 때만 event-editor.html로 이동합니다.
===================================================== */

async function events() {
  content.innerHTML = `
    <div class="news-center-head">
      <div>
        <div class="eyebrow">EVENT MANAGEMENT</div>
        <h1>🎉 이벤트 관리</h1>
        <p>이벤트 번호, 이름, 설명, 활성 상태와 보상을 한눈에 확인합니다. 편집은 수정 버튼을 눌렀을 때만 별도 편집 페이지에서 진행됩니다.</p>
      </div>
      <div class="news-head-actions">
        <button class="secondary" id="eventRefresh">↻ 새로고침</button>
      </div>
    </div>

    <div class="news-toolbar">
      <div class="search-box">
        <span>⌕</span>
        <input id="eventSearch" placeholder="번호, 이벤트 이름, 설명 검색">
      </div>
    </div>

    <div class="panel news-panel">
      <div class="news-list-title">
        <div><h2>이벤트 목록</h2><span id="eventResultCount">불러오는 중…</span></div>
        <span class="sort-label">번호순 ↑</span>
      </div>
      <div id="eventList" class="special-main-list">불러오는 중...</div>
    </div>
  `;

  $("#eventRefresh").onclick = events;
  $("#eventSearch").oninput = () => renderEventList(window.__doriEventRows || []);

  const { data, error } = await sb
    .from("rockey_news_events")
    .select("news_number,enabled,event_name,description,reward_coins")
    .order("news_number", { ascending: true });

  if (error) {
    $("#eventList").innerHTML = `<div class="empty"><b>이벤트를 불러오지 못했습니다.</b><br><small>${esc(error.message)}</small></div>`;
    return;
  }

  window.__doriEventRows = (data || []).sort((a, b) => Number(a.news_number) - Number(b.news_number));
  renderEventList(window.__doriEventRows);
}

function renderEventList(rows) {
  const q = String($("#eventSearch")?.value || "").trim().toLowerCase();
  const filtered = rows.filter(r => [r.news_number, r.event_name, r.description, r.reward_coins].join(" ").toLowerCase().includes(q));
  $("#eventResultCount").textContent = `${filtered.length}개 표시`;

  if (!filtered.length) {
    $("#eventList").innerHTML = `<div class="empty">조건에 맞는 이벤트가 없습니다.</div>`;
    return;
  }

  $("#eventList").innerHTML = `
    <div class="special-table-head event-grid">
      <span>번호</span><span>상태</span><span>이벤트 이름</span><span>설명</span><span>보상</span><span></span>
    </div>
    ${filtered.map((r, i) => `
      <div class="special-table-row event-grid" style="--delay:${Math.min(i, 15) * 20}ms">
        <strong>#${esc(r.news_number)}</strong>
        <span class="event-status ${r.enabled ? "on" : "off"}">${r.enabled ? "● 활성" : "○ 비활성"}</span>
        <div><b>${esc(r.event_name || "이름 없음")}</b></div>
        <p>${esc(r.description || "설명이 없습니다.")}</p>
        <span class="reward">🪙 ${Number(r.reward_coins || 0).toLocaleString()}</span>
        <button class="mini primary" type="button" data-event-edit="${esc(r.news_number)}">수정</button>
      </div>
    `).join("")}
  `;

  document.querySelectorAll("[data-event-edit]").forEach(btn => {
    btn.onclick = () => {
      const issue = encodeURIComponent(btn.dataset.eventEdit);
      window.location.href = `./event-editor.html?news_number=${issue}`;
    };
  });
}

/* =====================================================
   통계
===================================================== */

async function stats() {
  content.innerHTML = `
    <div class="grid cards">

      <div class="stat-card">

        <span>
          📈
        </span>

        <b id="uc">
          -
        </b>

        <small>
          회원
        </small>

      </div>


      <div class="stat-card">

        <span>
          🪙
        </span>

        <b id="tc">
          -
        </b>

        <small>
          총 돌돌코인
        </small>

      </div>


      <div class="stat-card">

        <span>
          ⭐
        </span>

        <b id="te">
          -
        </b>

        <small>
          총 EXP
        </small>

      </div>

    </div>


    <div class="panel">

      <h2>
        통계
      </h2>

      <p>
        현재 공개된 users 데이터를 기준으로
        합계를 계산합니다.
      </p>

    </div>
  `;


  const {
    data,
    error
  } =
    await sb
      .from("users")
      .select(
        "doldolcoin,exp"
      );


  if (error) {

    $("#uc").textContent = "—";
    $("#tc").textContent = "—";
    $("#te").textContent = "—";

    console.error(
      "통계 조회 오류:",
      error
    );

    return;
  }


  $("#uc").textContent =
    (
      data?.length || 0
    ).toLocaleString();


  $("#tc").textContent =
    (data || [])
      .reduce(
        (a, x) =>
          a +
          safeNumber(
            x.doldolcoin
          ),
        0
      )
      .toLocaleString();


  $("#te").textContent =
    (data || [])
      .reduce(
        (a, x) =>
          a +
          safeNumber(
            x.exp
          ),
        0
      )
      .toLocaleString();
}


/* =====================================================
   관리자 로그
===================================================== */

async function logs() {
  content.innerHTML = `
    <div class="panel">

      <h2>
        🧾 관리자 로그
      </h2>

      <div id="logtable">
        불러오는 중...
      </div>

    </div>
  `;


  const {
    data,
    error
  } =
    await sb
      .from("admin_logs")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(300);


  if (error) {

    $("#logtable").innerHTML =
      `
        <div class="empty">
          ${esc(error.message)}
        </div>
      `;

    return;
  }


  $("#logtable").innerHTML = `
    <table>

      <thead>

        <tr>

          <th>
            시간
          </th>

          <th>
            관리자
          </th>

          <th>
            작업
          </th>

          <th>
            대상
          </th>

          <th>
            상세
          </th>

        </tr>

      </thead>


      <tbody>

        ${
          (data || [])
            .map(
              l => `

                <tr>

                  <td>
                    ${esc(
                      formatDate(
                        l.created_at
                      )
                    )}
                  </td>


                  <td>
                    ${esc(
                      l.admin_user_id
                    )}
                  </td>


                  <td>
                    ${esc(
                      l.action
                    )}
                  </td>


                  <td>
                    ${esc(
                      l.target_user_id
                    )}
                  </td>


                  <td>
                    ${esc(
                      JSON.stringify(
                        l.details || {}
                      )
                    )}
                  </td>

                </tr>

              `
            )
            .join("")
        }

      </tbody>

    </table>
  `;
}


/* =====================================================
   보안
===================================================== */

async function security() {
  content.innerHTML = `
    <div class="panel">

      <h2>
        🛡️ 계정 보안 / 정지
      </h2>

      <p>
        회원 관리에서 회원을 검색한 뒤
        보안 RPC를 호출하는 구조입니다.
      </p>

      <div class="warning">

        영구 정지와 관리자 권한 변경은
        반드시 서버측 RPC/RLS에서 검증하세요.

      </div>

      <button
        class="secondary"
        id="securityUsers"
      >
        회원 관리로 이동
      </button>

    </div>
  `;


  const button =
    $("#securityUsers");

  if (button) {
    button.onclick =
      () =>
        render("users");
  }
}


/* =====================================================
   로그인 폼
===================================================== */

const loginForm =
  $("#loginForm");


if (loginForm) {

  loginForm.onsubmit =
    async e => {

      e.preventDefault();

      $("#authStatus").textContent =
        "관리자 계정 확인 중…";

      try {

        await signIn(
          $("#loginId").value.trim(),
          $("#password").value
        );

      } catch (x) {

        console.error(x);

        $("#authStatus").textContent =
          x?.message ||
          "로그인에 실패했습니다.";

        await sb.auth
          .signOut()
          .catch(() => {});

        clearVerified();
      }
    };
}


/* =====================================================
   로그아웃
===================================================== */

const logout =
  $("#logout");


if (logout) {

  logout.onclick =
    async () => {

      clearVerified();

      await sb.auth.signOut();

      location.reload();
    };
}


/* =====================================================
   네비게이션
===================================================== */

const nav =
  $("#nav");


if (nav) {

  nav.onclick =
    e => {

      const b =
        e.target.closest(
          "button[data-page]"
        );

      if (b) {

        const page = b.dataset.page;
        history.replaceState(null, "", `#${page}`);
        render(page);

      }
    };
}



document.querySelectorAll("[data-close-editor]").forEach(x => x.onclick = closeSideEditor);
document.addEventListener("keydown", e => { if(e.key === "Escape") closeSideEditor(); });

/* =====================================================
   Supabase Auth 상태 변화 감지
===================================================== */

sb.auth.onAuthStateChange(
  async (event, session) => {

    console.log(
      "Supabase Auth:",
      event
    );


    /* ---------------------------------------------------
       SIGNED_OUT이면 관리자 화면을 닫는다.
    --------------------------------------------------- */

    if (event === "SIGNED_OUT") {

      clearVerified();

      $("#authGate")
        ?.classList
        .remove("hidden");

      $("#app")
        ?.classList
        .add("hidden");

      return;
    }


    /* ---------------------------------------------------
       Magic Link 또는 다른 Auth 흐름으로
       세션이 새로 만들어진 경우.
    --------------------------------------------------- */

    if (
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED"
    ) {

      if (!session?.user) {
        return;
      }

      try {

        await loadProfile(
          session.user
        );

        setVerified(30);

        showApp();


        /*
         * 현재 이미 다른 페이지를 보고 있다면
         * 무조건 dashboard로 이동시키지 않는다.
         */

        if (
          !state.page ||
          state.page === "dashboard"
        ) {

          render(
            "dashboard"
          );

        }

      } catch (error) {

        console.error(
          "Auth 상태 변경 처리 오류:",
          error
        );

        await sb.auth
          .signOut()
          .catch(() => {});

        clearVerified();

        $("#authStatus").textContent =
          error?.message ||
          "관리자 인증에 실패했습니다.";
      }
    }
  }
);


/* =====================================================
   시작
===================================================== */

boot();
