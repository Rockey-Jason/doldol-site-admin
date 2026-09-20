const cfg = window.DORI_ADMIN_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);

const params = new URLSearchParams(location.search);
const issueParam = params.get("issue");
const isNew = params.get("new") === "1";

const state = {
  user: null,
  profile: null,
  row: null,
  editing: false,
  isNew: false
};


/* =========================================================
   기본 유틸
========================================================= */

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

function toast(msg, ok = true) {
  const el = $("#editorToast");
  if (!el) return;

  el.textContent = msg;
  el.className = ok ? "show ok" : "show";

  clearTimeout(window.__editorToast);

  window.__editorToast = setTimeout(() => {
    el.className = "";
  }, 2800);
}

function formatDate(v) {
  if (!v) return "";

  const d = new Date(v);

  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("ko-KR");
}


/* =========================================================
   문제 유형 변환
========================================================= */

/*
  DB question_type_enum

    multiple
    subjective

  관리자 사이트에서 사용하는 값

    multiple_choice
    short_answer

  DB → 화면
*/
function dbQuestionTypeToUi(value) {
  const type = String(value ?? "").trim().toLowerCase();

  if (type === "multiple") {
    return "multiple_choice";
  }

  if (type === "subjective") {
    return "short_answer";
  }

  /*
    혹시 이전 데이터에 이미 UI 값이 들어있다면
    그대로 사용할 수 있도록 처리
  */
  if (type === "multiple_choice") {
    return "multiple_choice";
  }

  if (type === "short_answer") {
    return "short_answer";
  }

  /*
    현재 DB enum에는 ox가 없지만,
    기존 데이터가 있을 경우 화면에서 유지
  */
  if (type === "ox") {
    return "ox";
  }

  return "multiple_choice";
}


/*
  화면 → RPC

    multiple_choice → multiple
    short_answer    → subjective
*/
function uiQuestionTypeToDb(value) {
  const type = String(value ?? "").trim().toLowerCase();

  if (type === "multiple_choice") {
    return "multiple";
  }

  if (type === "short_answer") {
    return "subjective";
  }

  /*
    이미 DB 값이 들어온 경우도 안전하게 처리
  */
  if (type === "multiple") {
    return "multiple";
  }

  if (type === "subjective") {
    return "subjective";
  }

  /*
    현재 DB enum에는 ox가 없으므로
    ox는 저장 단계에서 별도 오류를 내도록 함.
  */
  if (type === "ox") {
    return "ox";
  }

  return "";
}


/* =========================================================
   퀴즈 상태
========================================================= */

function isQuizReady(r) {
  if (!r) return false;

  const q = String(r.question ?? "").trim();
  const a = String(r.answer ?? "").trim();

  const type = String(
    r.question_type ?? "multiple"
  ).trim().toLowerCase();

  const choices = [1, 2, 3, 4, 5]
    .map(n => String(r[`choice${n}`] ?? "").trim())
    .filter(Boolean);

  /*
    DB 기준:
      subjective → 주관식
  */
  if (
    type === "subjective" ||
    type === "short_answer"
  ) {
    return Boolean(q && a);
  }

  /*
    객관식
  */
  return Boolean(q && a && choices.length);
}


function answerNumber(v) {
  const s = String(v ?? "").trim();

  if (/^[1-5]$/.test(s)) {
    return Number(s);
  }

  const m = s.match(/[1-5]/);

  return m ? Number(m[0]) : 0;
}


/* =========================================================
   이동
========================================================= */

function goList() {
  location.href = "./index.html#news";
}

$("#backList").onclick = goList;
$("#backAdmin").onclick = goList;


/* =========================================================
   초기 실행
========================================================= */

async function boot() {
  try {
    const {
      data: { session },
      error
    } = await sb.auth.getSession();

    if (error) throw error;

    if (!session?.user) {
      throw new Error(
        "관리자 센터에서 먼저 로그인해 주세요."
      );
    }

    state.user = session.user;

    const {
      data,
      error: pe
    } = await sb
      .from("users")
      .select("*")
      .eq("user_id", String(session.user.id))
      .single();

    if (pe) throw pe;

    if (
      data.is_admin !== true ||
      Number(data.user_level || 0) < 10
    ) {
      throw new Error("관리자 권한이 없습니다.");
    }

    state.profile = data;

    $("#editorUser").textContent =
      data.name ||
      data.login_id ||
      session.user.email ||
      "ADMIN";

    $("#editorApp").classList.remove("hidden");

    await loadIssue();

  } catch (e) {
    console.error(e);

    $("#editorAuthText").textContent =
      e.message ||
      "관리자 인증에 실패했습니다.";

    $("#editorAuth").classList.remove("hidden");
  }
}


/* =========================================================
   신문 불러오기
========================================================= */

async function loadIssue() {

  /*
    새 신문
  */
  if (isNew) {

    const next = Number(issueParam);

    state.isNew = true;

    state.row = {
      news_number:
        Number.isInteger(next) && next > 0
          ? next
          : 1,

      rockey_news: "",
      question: "",

      /*
        새 신문은 UI 값으로 초기화
      */
      question_type: "multiple_choice",

      choice1: "",
      choice2: "",
      choice3: "",
      choice4: "",
      choice5: "",

      answer: ""
    };

    renderEditor();

    return;
  }


  /*
    기존 신문
  */
  if (!issueParam) {
    showNotice(
      "회차 번호가 없습니다.",
      true
    );

    return;
  }


  const {
    data,
    error
  } = await sb
    .from("rockey_news")
    .select(
      "news_number,rockey_news,question,question_type,choice1,choice2,choice3,choice4,choice5,answer"
    )
    .eq("news_number", issueParam)
    .maybeSingle();


  if (error) {
    showNotice(error.message, true);
    return;
  }


  if (!data) {
    showNotice(
      `제${esc(issueParam)}호 데이터를 찾을 수 없습니다.`,
      true
    );

    return;
  }


  /*
    중요:
    DB 값은 multiple / subjective
    UI에서 사용할 값으로 변환
  */
  data.question_type =
    dbQuestionTypeToUi(data.question_type);


  state.row = data;

  renderView();
}


/* =========================================================
   알림
========================================================= */

function showNotice(msg, error = false) {
  const n = $("#editorNotice");

  n.textContent = msg;

  n.className =
    `editor-notice ${error ? "error" : ""}`;

  n.classList.remove("hidden");

  $("#issueView").innerHTML = "";
}


/* =========================================================
   상세 보기
========================================================= */

function renderView() {

  const r = state.row;

  const ready = isQuizReady(r);

  const num = esc(r.news_number);

  const choices = [1, 2, 3, 4, 5]
    .map(n => ({
      n,
      text: r[`choice${n}`]
    }))
    .filter(x =>
      String(x.text ?? "").trim()
    );

  const ans = answerNumber(r.answer);


  /*
    화면에 표시할 문제 유형
  */
  const uiType =
    dbQuestionTypeToUi(r.question_type);


  const typeLabel =
    uiType === "multiple_choice"
      ? "객관식"
      : uiType === "short_answer"
        ? "주관식"
        : uiType === "ox"
          ? "OX"
          : "";


  $("#issueView").innerHTML = `

    <section class="issue-hero">

      <div class="issue-kicker">
        DORI NEWS · ${num}
      </div>

      <div class="issue-hero-line">

        <div>

          <h1>제${num}호</h1>

          <p>
            ${
              ready
                ? "신문과 퀴즈가 모두 준비되어 있습니다."
                : "신문은 확인되었지만 퀴즈가 아직 작성되지 않았습니다."
            }
          </p>

        </div>

        <span class="big-status ${ready ? "ready" : "missing"}">
          ${ready ? "✓ COMPLETE" : "! QUIZ MISSING"}
        </span>

      </div>

    </section>


    <section class="content-preview-grid">


      <!-- 신문 -->

      <article class="content-card news-preview-card">

        <div class="content-card-head">

          <span class="round-icon">📰</span>

          <div>

            <span class="eyebrow">
              NEWS ARTICLE
            </span>

            <h2>돌이신문</h2>

          </div>

        </div>

        <div class="article-body">

          ${
            r.rockey_news
              ? esc(r.rockey_news)
                  .replace(/\n/g, "<br>")
              : '<div class="empty-inline">신문 내용이 아직 없습니다.</div>'
          }

        </div>

      </article>


      <!-- 퀴즈 -->

      <article class="content-card quiz-preview-card">

        <div class="content-card-head">

          <span class="round-icon">❓</span>

          <div>

            <span class="eyebrow">
              QUIZ
            </span>

            <h2>돌이퀴즈</h2>

          </div>

          <span class="quiz-state ${ready ? "ready" : "missing"}">

            ${ready ? "작성됨" : "미작성"}

          </span>

        </div>


        ${
          r.question

            ? `

              <div class="question-box">

                <small>
                  QUESTION
                </small>

                <div style="
                  display:flex;
                  align-items:center;
                  gap:10px;
                  margin-bottom:10px;
                ">

                  <h3 style="margin:0;">
                    ${esc(r.question)}
                  </h3>

                  ${
                    typeLabel
                      ? `<span style="
                          display:inline-flex;
                          align-items:center;
                          padding:5px 10px;
                          border-radius:999px;
                          background:rgba(80,120,255,.12);
                          border:1px solid rgba(100,140,255,.25);
                          font-size:12px;
                          white-space:nowrap;
                        ">${typeLabel}</span>`
                      : ""
                  }

                </div>

              </div>


              ${
                uiType === "multiple_choice"

                  ? `

                    <div class="choice-preview">

                      ${choices.map(x => `

                        <div class="choice ${x.n === ans ? "answer" : ""}">

                          <span>${x.n}</span>

                          <b>
                            ${esc(x.text)}
                          </b>

                          ${
                            x.n === ans
                              ? "<i>정답</i>"
                              : ""
                          }

                        </div>

                      `).join("")}

                    </div>

                  `

                  : uiType === "short_answer"

                    ? `

                      <div class="answer-box">

                        정답

                        <strong>
                          ${esc(r.answer)}
                        </strong>

                      </div>

                    `

                    : ""

              }


              ${
                uiType === "multiple_choice"

                  ? `

                    <div class="answer-box">

                      정답

                      <strong>
                        ${
                          ans
                            ? `${ans}번`
                            : esc(r.answer)
                        }
                      </strong>

                    </div>

                  `

                  : ""

              }

            `

            : `

              <div class="missing-quiz">

                <div>❓</div>

                <b>
                  퀴즈가 아직 작성되지 않았습니다.
                </b>

                <span>
                  편집 화면에서 문제와 선택지를 작성할 수 있습니다.
                </span>

              </div>

            `
        }

      </article>

    </section>


    <div class="editor-actions">

      <button
        class="secondary"
        id="backToList2"
      >
        ← 목록으로
      </button>

      <button
        class="primary editor-main-btn"
        id="editIssue"
      >
        ✎ ${
          ready
            ? "내용 수정"
            : "퀴즈 작성 / 내용 수정"
        }
      </button>

    </div>

  `;


  $("#backToList2").onclick = goList;

  $("#editIssue").onclick = () => {

    state.editing = true;

    renderEditor();

  };

}


/* =========================================================
   편집 화면
========================================================= */

function renderEditor() {

  const r = state.row;


  /*
    DB → UI 변환
    혹시 state.row에 DB 값이 들어와도 안전하게 처리
  */
  const uiQuestionType =
    dbQuestionTypeToUi(r.question_type);


  $("#issueView").innerHTML = `

    <section class="edit-header">

      <div>

        <span class="eyebrow">
          EDITOR MODE
        </span>

        <h1>
          제${esc(r.news_number)}호 편집
        </h1>

        <p>
          신문과 퀴즈를 한 화면에서 작성하고 저장합니다.
        </p>

      </div>

      <span
        class="save-state"
        id="saveState"
      >
        ● 편집 중
      </span>

    </section>


    <form
      id="issueForm"
      class="professional-form"
    >

      <div class="form-grid">


        <!-- 신문 -->

        <section class="edit-card full">

          <div class="edit-card-head">

            <span class="round-icon">
              📰
            </span>

            <div>

              <h2>돌이신문</h2>

              <small>
                신문 본문
              </small>

            </div>

          </div>


          <label>

            회차 번호

            <input
              id="newsNumber"
              type="number"
              min="1"
              required
              value="${esc(r.news_number)}"
            >

          </label>


          <label>

            신문 내용

            <textarea
              id="newsText"
              rows="18"
              placeholder="돌이신문 내용을 입력하세요."
            >${esc(r.rockey_news)}</textarea>

          </label>

        </section>


        <!-- 퀴즈 -->

        <section class="edit-card">

          <div class="edit-card-head">

            <span class="round-icon">
              ❓
            </span>

            <div>

              <h2>돌이퀴즈</h2>

              <small>
                문제와 선택지를 작성하세요.
              </small>

            </div>

          </div>


          <label>

            문제

            <textarea
              id="question"
              rows="6"
              placeholder="퀴즈 문제를 입력하세요."
            >${esc(r.question)}</textarea>

          </label>


          <label>

            문제 유형

            <select id="questionType">

              <option
                value="multiple_choice"
                ${uiQuestionType === "multiple_choice" ? "selected" : ""}
              >
                객관식
              </option>

              <option
                value="short_answer"
                ${uiQuestionType === "short_answer" ? "selected" : ""}
              >
                주관식
              </option>

            </select>

          </label>


          <div class="choices-grid">

            ${[1,2,3,4,5].map(n => `

              <label>

                선택지 ${n}

                <input
                  id="choice${n}"
                  value="${esc(r[`choice${n}`])}"
                  placeholder="선택지 ${n}"
                >

              </label>

            `).join("")}

          </div>


          <div class="answer-picker">

            <span>
              정답 선택
            </span>

            <div>

              ${[1,2,3,4,5].map(n => `

                <label>

                  <input
                    type="radio"
                    name="answer"
                    value="${n}"
                    ${answerNumber(r.answer) === n ? "checked" : ""}
                  >

                  ${n}번

                </label>

              `).join("")}

            </div>


            <input
              id="answerRaw"
              value="${esc(r.answer)}"
              placeholder="정답이 숫자가 아닌 경우 직접 입력"
            >

          </div>

        </section>

      </div>


      <div class="editor-actions sticky-actions">

        <button
          type="button"
          class="secondary"
          id="cancelEdit"
        >
          취소
        </button>

        <button
          type="submit"
          class="primary editor-main-btn"
          id="saveIssue"
        >
          ✓ 저장하기
        </button>

      </div>

    </form>
  `;


  $("#cancelEdit").onclick = () =>
    state.isNew
      ? goList()
      : renderView();


  $("#issueForm").onsubmit = saveIssue;


  document
    .querySelectorAll('input[name="answer"]')
    .forEach(x => {

      x.onchange = () => {

        $("#answerRaw").value = "";

      };

    });


  $("#answerRaw").oninput = () => {

    document
      .querySelectorAll('input[name="answer"]')
      .forEach(x => {
        x.checked = false;
      });

  };

}


/* =========================================================
   저장
========================================================= */

async function saveIssue(e) {

  e.preventDefault();


  const btn = $("#saveIssue");

  btn.disabled = true;

  btn.textContent = "저장 중…";


  const selected =
    document.querySelector(
      'input[name="answer"]:checked'
    );


  const raw =
    String(
      $("#answerRaw").value || ""
    ).trim();


  const answer =
    raw ||
    selected?.value ||
    "";


  /*
    화면에서 선택된 문제 유형
  */
  const uiQuestionType =
    $("#questionType").value;


  /*
    화면 → DB용 값으로 변환

      multiple_choice → multiple
      short_answer    → subjective
  */
  const dbQuestionType =
    uiQuestionTypeToDb(uiQuestionType);


  const payload = {

    news_number:
      Number($("#newsNumber").value),

    rockey_news:
      $("#newsText").value,

    question:
      $("#question").value,

    /*
      state.row에는 UI 값을 유지
    */
    question_type:
      uiQuestionType,

    choice1:
      $("#choice1").value,

    choice2:
      $("#choice2").value,

    choice3:
      $("#choice3").value,

    choice4:
      $("#choice4").value,

    choice5:
      $("#choice5").value,

    answer

  };


  if (
    !Number.isInteger(payload.news_number) ||
    payload.news_number < 1
  ) {

    toast(
      "회차 번호를 확인하세요.",
      false
    );

    btn.disabled = false;
    btn.textContent = "✓ 저장하기";

    return;
  }


  const quizStarted =
    payload.question.trim() ||
    answer ||
    [1,2,3,4,5].some(
      n =>
        payload[`choice${n}`].trim()
    );


  if (
    quizStarted &&
    (
      !payload.question.trim() ||
      !answer
    )
  ) {

    toast(
      "퀴즈를 작성했다면 문제와 정답을 모두 입력하세요.",
      false
    );

    btn.disabled = false;
    btn.textContent = "✓ 저장하기";

    return;
  }


  /*
    객관식이면 정답은 1~5
  */
  if (
    answer &&
    !/^[1-5]$/.test(answer) &&
    uiQuestionType === "multiple_choice"
  ) {

    toast(
      "객관식 정답은 1~5번 중 하나로 입력하세요.",
      false
    );

    btn.disabled = false;
    btn.textContent = "✓ 저장하기";

    return;
  }


  /*
    현재 DB enum에는 multiple / subjective만 존재.
    따라서 ox는 사용하지 않음.
  */
  if (uiQuestionType === "ox") {

    toast(
      "현재 DB에서는 OX 문제 유형을 지원하지 않습니다.",
      false
    );

    btn.disabled = false;
    btn.textContent = "✓ 저장하기";

    return;
  }


  try {

    /*
      새 신문이면 null
      기존 신문이면 기존 회차 번호
    */
    const oldNumber =
      state.isNew
        ? null
        : Number(state.row.news_number);


    const { error } =
      await sb.rpc(
        "admin_save_news_issue",
        {

          p_old_news_number:
            oldNumber,

          p_news_number:
            payload.news_number,

          p_rockey_news:
            payload.rockey_news,

          p_question:
            payload.question,

          /*
            중요:
            여기서는 DB enum에 맞는 값을 RPC로 보냄
          */
          p_question_type:
            dbQuestionType,

          p_choice1:
            payload.choice1,

          p_choice2:
            payload.choice2,

          p_choice3:
            payload.choice3,

          p_choice4:
            payload.choice4,

          p_choice5:
            payload.choice5,

          p_answer:
            payload.answer

        }
      );


    if (error) {
      throw error;
    }


    toast("저장되었습니다.");


    state.isNew = false;


    /*
      화면 상태에는 UI 값을 저장
    */
    state.row = {

      ...payload,

      /*
        화면에서 계속 사용할 값
      */
      question_type:
        uiQuestionType

    };


    history.replaceState(
      null,
      "",
      `./editor.html?issue=${encodeURIComponent(
        payload.news_number
      )}`
    );


    renderView();


  } catch (err) {

    console.error(err);

    toast(
      err.message ||
      "저장에 실패했습니다.",
      false
    );

    btn.disabled = false;

    btn.textContent =
      "✓ 저장하기";

  }

}


/* =========================================================
   인증 상태
========================================================= */

sb.auth.onAuthStateChange(
  (event, session) => {

    if (event === "SIGNED_OUT") {

      location.href =
        "./index.html";

    }

  }
);


/* =========================================================
   시작
========================================================= */

boot();
