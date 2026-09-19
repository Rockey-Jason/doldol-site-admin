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

  if (!e) return;

  e.textContent = msg;
  e.className = ok ? "show ok" : "show";

  setTimeout(() => {
    e.className = "";
  }, 2800);
}


/* HTML Escape */
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
     5. 현재 브라우저에서는 관리자 화면을
        바로 표시하지 않는다.
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

      /*
       * 현재 브라우저에서 Supabase Auth 세션이
       * 정상적으로 만들어졌으므로 관리자 인증 완료.
       */
      setVerified(30);

      showApp();

      render("dashboard");

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

    const authStatus = $("#authStatus");

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
    usersCount,
    newsCount,
    itemsCount,
    eventsCount
  ] =
    await Promise.all([
      count("users"),
      count("rockey_news"),
      count("dori_box_items"),
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
          ${safeNumber(x[1]).toLocaleString()}
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
                  ${esc(formatDate(l.created_at))}
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

  /*
   * 관리자 전용 SECURITY DEFINER RPC
   *
   * public.users를 기준으로 회원을 조회하고
   * auth.users 정보를 함께 반환하도록 구성.
   */
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

window.editUser = async u => {

  const currentCoins =
    safeNumber(
      u.doldolcoin
    );

  const currentExp =
    safeNumber(
      u.exp
    );

  const currentLevel =
    safeNumber(
      u.user_level
    );


  const coins =
    prompt(
      `돌돌코인 (현재 ${currentCoins})`,
      String(currentCoins)
    );

  if (coins === null) {
    return;
  }


  const exp =
    prompt(
      `EXP (현재 ${currentExp})`,
      String(currentExp)
    );

  if (exp === null) {
    return;
  }


  const level =
    prompt(
      "user_level",
      String(currentLevel)
    );

  if (level === null) {
    return;
  }


  const coinNumber =
    Number(coins);

  const expNumber =
    Number(exp);

  const levelNumber =
    Number(level);


  if (
    !Number.isFinite(coinNumber) ||
    !Number.isFinite(expNumber) ||
    !Number.isInteger(levelNumber)
  ) {

    toast(
      "숫자를 정확하게 입력하세요.",
      false
    );

    return;
  }


  if (
    coinNumber < 0 ||
    expNumber < 0 ||
    levelNumber < 1 ||
    levelNumber > 10
  ) {

    toast(
      "코인/EXP/레벨 값을 확인하세요.",
      false
    );

    return;
  }


  const {
    error
  } =
    await sb.rpc(
      "admin_update_user",
      {
        p_user_id:
          String(u.user_id),

        p_doldolcoin:
          coinNumber,

        p_exp:
          expNumber,

        p_user_level:
          levelNumber
      }
    );

  if (error) {

    console.error(
      "회원 수정 오류:",
      error
    );

    toast(
      error.message,
      false
    );

    return;
  }


  toast(
    "회원 정보가 수정되었습니다."
  );

  await loadUsers(
    $("#userSearch")?.value || ""
  );
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


  const input =
    prompt(
      "선택 회원에게 지급할 돌돌코인",
      "1000"
    );

  if (input === null) {
    return;
  }


  const coins =
    Number(input);


  if (
    !Number.isFinite(coins) ||
    !Number.isInteger(coins)
  ) {

    return toast(
      "정수로 입력하세요.",
      false
    );
  }


  if (coins <= 0) {

    return toast(
      "지급 코인은 1 이상이어야 합니다.",
      false
    );
  }


  for (const id of ids) {

    const {
      error
    } =
      await sb.rpc(
        "admin_adjust_coins",
        {
          p_user_id:
            String(id),

          p_amount:
            coins,

          p_reason:
            "관리자 일괄 지급"
        }
      );

    if (error) {

      console.error(
        "코인 지급 오류:",
        error
      );

      return toast(
        error.message,
        false
      );
    }
  }


  toast(
    `${ids.length}명에게 지급했습니다.`
  );

  await loadUsers("");
}


/* =====================================================
   돌이신문
===================================================== */

async function news() {

  await crudPage(
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

  await crudPage(
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


  $("#crud").innerHTML =
    (data || [])
      .map(
        r => `
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
   랜덤박스
===================================================== */

async function box() {

  await crudPage(
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

  await crudPage(
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
      () => render("users");

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

        render(
          b.dataset.page
        );

      }
    };
}


/* =====================================================
   Supabase Auth 상태 변화 감지
===================================================== */

sb.auth.onAuthStateChange(
  async (event, session) => {

    console.log(
      "Supabase Auth:",
      event
    );

    /*
     * SIGNED_OUT이면 관리자 화면을 닫는다.
     */
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


    /*
     * Magic Link 또는 다른 Auth 흐름으로
     * 세션이 새로 만들어진 경우.
     */
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
          render("dashboard");
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
