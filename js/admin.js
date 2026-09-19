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
  selected: new Set()
};

const VERIFIED_KEY = "dori_admin_verified_until";


/* =====================================================
   기본 유틸
===================================================== */

function toast(msg, ok = true) {
  const e = $("#toast");

  e.textContent = msg;
  e.className = ok ? "show ok" : "show";

  setTimeout(() => {
    e.className = "";
  }, 2800);
}


function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m])
  );
}

function formatDate(value) {
  if (!value) return "—";

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
    .eq("user_id", String(user.id))
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

  $("#adminName").textContent =
    ` · ${
      data.name ||
      data.login_id ||
      user.email ||
      ""
    }`;
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
  } catch {}

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

  /* -----------------------------------------------
     1. login_id 확인
  ------------------------------------------------ */

  $("#authStatus").textContent =
    "관리자 계정을 확인하는 중…";

  const email =
    await resolveEmail(id);


  /* -----------------------------------------------
     2. Supabase 비밀번호 로그인
  ------------------------------------------------ */

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


  /* -----------------------------------------------
     3. 관리자 권한 확인
  ------------------------------------------------ */

  $("#authStatus").textContent =
    "관리자 권한을 확인하는 중…";

  await loadProfile(
    data.user
  );


  /* -----------------------------------------------
     4. 이메일 인증 링크 발송
  ------------------------------------------------ */

  $("#authStatus").textContent =
    "관리자 이메일 인증 메일을 보내는 중…";

  await requestEmailVerification();


  /* -----------------------------------------------
     로그인 브라우저에는 아직 관리자 화면을
     바로 보여주지 않는다.
  ------------------------------------------------ */

  $("#authStatus").textContent =
    "인증 메일을 확인해 주세요. 다른 브라우저에서 열어도 됩니다.";
}


/* =====================================================
   관리자 사이트 시작
===================================================== */

async function boot() {

  try {

    /*
     * =================================================
     * 중요
     *
     * 기존 방식:
     *
     *   URL ?admin_token=...
     *          ↓
     *   기존 브라우저 세션 확인
     *
     * 새로운 방식:
     *
     *   이메일 Magic Link
     *          ↓
     *   Supabase Auth
     *          ↓
     *   현재 브라우저에 새로운 세션 생성
     *
     * 따라서 admin_token을 직접 검사하지 않는다.
     * =================================================
     */


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


    /* -----------------------------------------------
       세션이 존재하는 경우
    ------------------------------------------------ */

    if (user) {

      /*
       * 현재 브라우저에서 생성된 Supabase
       * 세션의 사용자가 진짜 관리자인지 확인
       */

      await loadProfile(user);


      /*
       * 관리자 인증 완료
       *
       * 30분 동안 현재 브라우저에서 유지
       */

      setVerified(30);


      /*
       * 관리자 앱 표시
       */

      showApp();


      /*
       * 대시보드 표시
       */

      render("dashboard");

      return;
    }


    /* -----------------------------------------------
       세션이 없는 경우
    ------------------------------------------------ */

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

    $("#authStatus").textContent =
      error?.message ||
      "관리자 인증에 실패했습니다.";
  }
}


/* =====================================================
   관리자 앱 표시
===================================================== */

function showApp() {

  $("#authGate")
    .classList
    .add("hidden");

  $("#app")
    .classList
    .remove("hidden");
}


/* =====================================================
   페이지 렌더링
===================================================== */

function render(page) {

  state.page = page;

  state.selected.clear();

  document
    .querySelectorAll("#nav button")
    .forEach(b =>
      b.classList.toggle(
        "active",
        b.dataset.page === page
      )
    );

  $("#pageTitle").textContent =
    document
      .querySelector(
        `#nav button[data-page="${page}"]`
      )
      ?.textContent
      .trim() ||
    "관리";

  ({
    dashboard,
    users,
    news,
    quiz,
    box,
    events,
    stats,
    logs,
    security
  }[page] || dashboard)();
}


/* =====================================================
   테이블 개수
===================================================== */

async function count(table) {

  const {
    count
  } = await sb
    .from(table)
    .select("*", {
      count: "exact",
      head: true
    });

  return count || 0;
}


/* =====================================================
   대시보드
===================================================== */

async function dashboard() {

  content.innerHTML = `
    <div class="hero">
      <h1>돌이 관리자 센터 🐶</h1>
      <p>
        사이트의 핵심 데이터를 한 곳에서 관리하세요.
      </p>
    </div>

    <div
      class="grid cards"
      id="cards"
    ></div>

    <div class="panel">
      <h2>최근 활동</h2>
      <div id="recent">
        불러오는 중...
      </div>
    </div>
  `;

  const [
    users,
    news,
    items,
    events
  ] =
    await Promise.all([
      count("users"),
      count("rockey_news"),
      count("dori_box_items"),
      count("rockey_news_events")
    ]);

  $("#cards").innerHTML = [
    ["회원", users, "👥"],
    ["신문", news, "📰"],
    ["랜덤박스 아이템", items, "🎁"],
    ["이벤트", events, "🎉"]
  ]
    .map(x => `
      <div class="stat-card">
        <span>${x[2]}</span>
        <b>${x[1].toLocaleString()}</b>
        <small>${x[0]}</small>
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
    data
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
                  ${new Date(
                    l.created_at
                  ).toLocaleString()}
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

  /*
   * 회원 목록은 관리자 전용 SECURITY DEFINER RPC를 사용합니다.
   * 이 함수는 public.users를 기준으로 auth.users를 LEFT JOIN하므로
   * Auth 계정이 없는 users 행도 회원 목록에서 사라지지 않습니다.
   * 관리자 여부는 조회 필터가 아니라 각 행의 정보로만 표시합니다.
   */
  const { data, error } = await sb.rpc("admin_list_users", {
    p_search: q || null,
    p_limit: 500,
    p_offset: 0
  });

  if (error) {
    console.error("회원 목록 조회 오류:", error);
    $("#userTable").innerHTML = `
      <div class="empty">
        <b>회원 목록을 불러오지 못했습니다.</b>
        <br>
        <small>${esc(error.message)}</small>
        <br><br>
        <small>Supabase SQL의 admin_list_users()가 배포되어 있는지 확인하세요.</small>
      </div>
    `;
    return;
  }

  const rows = Array.isArray(data) ? data : [];

  $("#userTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="all"></th>
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
        ${rows.length ? rows.map(u => `
          <tr>
            <td>
              <input type="checkbox" class="sel" data-id="${esc(u.user_id)}">
            </td>
            <td>${esc(u.user_number)}</td>
            <td>${esc(u.login_id)}</td>
            <td>${esc(u.name)}</td>
            <td>Lv.${esc(u.user_level)}</td>
            <td>${Number(u.doldolcoin || 0).toLocaleString()}</td>
            <td>${Number(u.exp || 0).toLocaleString()}</td>
            <td>
              <span class="pill ${u.is_admin ? "" : "muted"}">
                ${u.is_admin ? "관리자" : "일반 회원"}
              </span>
            </td>
            <td>
              ${u.auth_user_id
                ? (u.email_confirmed_at ? "인증됨" : "미인증")
                : "Auth 없음"}
            </td>
            <td>${esc(formatDate(u.last_sign_in_at))}</td>
            <td>
              <button class="mini" onclick='editUser(${JSON.stringify(u)})'>수정</button>
            </td>
          </tr>
        `).join("") : `
          <tr><td colspan="11" class="empty">조회된 회원이 없습니다.</td></tr>
        `}
      </tbody>
    </table>
  `;

  const all = $("#all");
  if (all) {
    all.onchange = e =>
      document.querySelectorAll(".sel").forEach(x => {
        x.checked = e.target.checked;
      });
  }
}


/* =====================================================
   회원 수정
===================================================== */

window.editUser = async u => {

  const coins =
    prompt(
      "돌돌코인 (현재 " +
      u.doldolcoin +
      ")",
      u.doldolcoin
    );

  if (coins === null) {
    return;
  }

  const exp =
    prompt(
      "EXP (현재 " +
      u.exp +
      ")",
      u.exp
    );

  if (exp === null) {
    return;
  }

  const level =
    prompt(
      "user_level",
      u.user_level
    );

  if (level === null) {
    return;
  }

  const {
    error
  } =
    await sb.rpc(
      "admin_update_user",
      {
        p_user_id:
          u.user_id,

        p_doldolcoin:
          Number(coins),

        p_exp:
          Number(exp),

        p_user_level:
          Number(level)
      }
    );

  if (error) {

    toast(
      error.message,
      false
    );

  } else {

    toast(
      "회원 정보가 수정되었습니다."
    );

    loadUsers(
      $("#userSearch").value
    );
  }
};


/* =====================================================
   회원 일괄 지급
===================================================== */

async function bulkReward() {

  const ids =
    [
      ...document
        .querySelectorAll(
          ".sel:checked"
        )
    ]
      .map(
        x =>
          x.dataset.id
      );

  if (!ids.length) {

    return toast(
      "회원을 선택하세요.",
      false
    );
  }

  const coins =
    Number(
      prompt(
        "선택 회원에게 지급할 돌돌코인",
        "1000"
      )
    );

  if (!Number.isFinite(coins)) {
    return;
  }

  for (const id of ids) {

    const {
      error
    } =
      await sb.rpc(
        "admin_adjust_coins",
        {
          p_user_id: id,
          p_amount: coins,
          p_reason:
            "관리자 일괄 지급"
        }
      );

    if (error) {

      return toast(
        error.message,
        false
      );
    }
  }

  toast(
    `${ids.length}명에게 지급했습니다.`
  );

  loadUsers("");
}


/* =====================================================
   돌이신문
===================================================== */

async function news() {

  crudPage(
    "📰 돌이신문",
    "rockey_news",
    [
      "news_number",
      "rockey_news",
      "question",
      "question_type",
      "choice1",
      "choice2",
      "choice3",
      "choice4",
      "choice5",
      "answer"
    ]
  );
}


/* =====================================================
   퀴즈
===================================================== */

async function quiz() {

  crudPage(
    "❓ 돌이 퀴즈",
    "rockey_news",
    [
      "news_number",
      "question",
      "question_type",
      "choice1",
      "choice2",
      "choice3",
      "choice4",
      "choice5",
      "answer"
    ]
  );
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
        ${title}
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

  $("#crud").innerHTML =
    data?.map(
      r => `
        <div class="crud-row">

          <div>

            <b>
              ${esc(r[cols[0]])}
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
            class="mini"
            onclick='editRecord(
              ${JSON.stringify(table)},
              ${JSON.stringify(cols)},
              ${JSON.stringify(r)}
            )'
          >
            수정
          </button>

        </div>
      `
    )
    .join("") ||
    "데이터가 없습니다.";
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

      payload[c] = v;
    }

    const key =
      cols[0];

    const q =
      row[key] != null

        ? sb
            .from(table)
            .update(payload)
            .eq(
              key,
              row[key]
            )

        : sb
            .from(table)
            .insert(payload);

    const {
      error
    } =
      await q;

    if (error) {

      toast(
        error.message,
        false
      );

    } else {

      toast(
        "저장되었습니다."
      );

      render(
        state.page
      );
    }
  };


/* =====================================================
   랜덤박스
===================================================== */

async function box() {

  crudPage(
    "🎁 랜덤박스 아이템",
    "dori_box_items",
    [
      "id",
      "item_code",
      "item_name",
      "probability",
      "reward_coins",
      "reward_exp"
    ]
  );
}


/* =====================================================
   이벤트
===================================================== */

async function events() {

  crudPage(
    "🎉 이벤트",
    "rockey_news_events",
    [
      "news_number",
      "enabled",
      "event_name",
      "description",
      "reward_coins"
    ]
  );
}


/* =====================================================
   통계
===================================================== */

async function stats() {

  content.innerHTML = `
    <div class="grid cards">

      <div class="stat-card">
        <span>📈</span>
        <b id="uc">-</b>
        <small>회원</small>
      </div>

      <div class="stat-card">
        <span>🪙</span>
        <b id="tc">-</b>
        <small>총 돌돌코인</small>
      </div>

      <div class="stat-card">
        <span>⭐</span>
        <b id="te">-</b>
        <small>총 EXP</small>
      </div>

    </div>

    <div class="panel">

      <h2>
        통계
      </h2>

      <p>
        실제 합계는 보안 RPC를 통해 계산하도록
        구성할 수 있습니다.
      </p>

    </div>
  `;

  const {
    data
  } =
    await sb
      .from("users")
      .select(
        "doldolcoin,exp"
      );

  $("#uc").textContent =
    (
      data?.length || 0
    ).toLocaleString();

  $("#tc").textContent =
    (data || [])
      .reduce(
        (a, x) =>
          a +
          Number(
            x.doldolcoin || 0
          ),
        0
      )
      .toLocaleString();

  $("#te").textContent =
    (data || [])
      .reduce(
        (a, x) =>
          a +
          Number(
            x.exp || 0
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

  $("#logtable").innerHTML =
    error

      ? esc(error.message)

      : `
        <table>

          <thead>

            <tr>
              <th>시간</th>
              <th>관리자</th>
              <th>작업</th>
              <th>대상</th>
              <th>상세</th>
            </tr>

          </thead>

          <tbody>

            ${
              (data || [])
                .map(
                  l => `
                    <tr>

                      <td>
                        ${new Date(
                          l.created_at
                        ).toLocaleString()}
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
        onclick="users()"
      >
        회원 관리로 이동
      </button>

    </div>
  `;
}


/* =====================================================
   로그인 폼
===================================================== */

$("#loginForm").onsubmit =
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
        x.message ||
        "로그인에 실패했습니다.";

      await sb.auth
        .signOut()
        .catch(() => {});

      clearVerified();
    }
  };


/* =====================================================
   로그아웃
===================================================== */

$("#logout").onclick =
  async () => {

    clearVerified();

    await sb.auth.signOut();

    location.reload();
  };


/* =====================================================
   네비게이션
===================================================== */

$("#nav").onclick =
  e => {

    const b =
      e.target.closest(
        "button[data-page]"
      );

    if (b) {
      render(
        b.dataset.page
      );
    }
  };


/* =====================================================
   시작
===================================================== */

boot();
