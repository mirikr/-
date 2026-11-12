// Инструменты подготовки поверх учебника: вкладка «Старт» (план на сегодня,
// повторение, тренировки, карта знаний, отметки) и сами тренировки — блиц,
// разбор дела, экономические задачи, второй тур. Всё состояние — в localStorage.
(function () {
  var D = window.OLYMP_DATA, esc = OB.esc, norm = OB.norm, shuffle = OB.shuffle;
  function get(k, def) { try { return JSON.parse(localStorage.getItem(k) || "null") || def; } catch (e) { return def; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function pad(n) { return String(n).padStart(2, "0"); }
  function dayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function plusDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); }
  var TODAY = dayKey(new Date());
  function ruDate(key) { var p = key.split("-"); return Number(p[2]) + " " + ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"][Number(p[1]) - 1]; }
  function word(n, a, b, c) { var t = n % 100, l = n % 10; return t > 10 && t < 15 ? c : l === 1 ? a : l >= 2 && l <= 4 ? b : c; }
  function num(x) { return String(Math.round(x * 100) / 100).replace(".", ","); }

  // ---- окно инструмента ---------------------------------------------------
  var tool = document.createElement("div");
  tool.className = "quiz"; tool.id = "tool"; tool.hidden = true;
  tool.setAttribute("role", "dialog"); tool.setAttribute("aria-modal", "true");
  tool.innerHTML = '<div class="q-head"><b id="tool-title"></b><button type="button" id="tool-close">Закрыть</button></div><div class="q-body"><div class="q-in" id="tool-in"></div></div>';
  document.body.appendChild(tool);
  var tin = tool.querySelector("#tool-in"), onToolClose = null, timers = [];
  function sheet(title) {
    timers.forEach(clearInterval); timers = [];
    tool.querySelector("#tool-title").textContent = title;
    tool.hidden = false; document.body.style.overflow = "hidden"; tin.innerHTML = ""; tool.querySelector(".q-body").scrollTop = 0;
    return tin;
  }
  function closeTool() { timers.forEach(clearInterval); timers = []; tool.hidden = true; tin.innerHTML = ""; document.body.style.overflow = ""; if (onToolClose) onToolClose(); onToolClose = null; renderHome(); }
  tool.querySelector("#tool-close").addEventListener("click", closeTool);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !tool.hidden) closeTool(); });
  var handlers = {};
  tin.addEventListener("click", function (e) { var b = e.target.closest("[data-do]"); if (b && !b.disabled && handlers[b.getAttribute("data-do")]) handlers[b.getAttribute("data-do")](b); });

  // ---- повторение по забыванию -------------------------------------------
  // Ошибся в термине — он возвращается завтра, потом через 3 и 7 дней.
  var GAPS = [1, 3, 7];
  OB.onAnswer = function (it, ok) {
    var srs = get("olymp-srs", {}), k = norm(it.t), c = srs[k];
    if (!ok) srs[k] = { t: it.t, d: it.d, step: 0, due: plusDays(1) };
    else if (c && c.due <= TODAY) { c.step += 1; if (c.step >= GAPS.length) delete srs[k]; else c.due = plusDays(GAPS[c.step]); }
    else return;
    set("olymp-srs", srs);
  };
  OB.onQuizEnd = function () { renderHome(); };
  function dueCards() { var srs = get("olymp-srs", {}); return Object.keys(srs).map(function (k) { return srs[k]; }); }
  function openRepeat() {
    var due = dueCards().filter(function (c) { return c.due <= TODAY; });
    if (!due.length) return;
    OB.quizSets.repeat = { title: "Повторение", pairs: due.map(function (c) { return { t: c.t, d: c.d }; }), temp: true };
    OB.openQuiz("repeat");
  }

  // ---- что прочитано -----------------------------------------------------
  OB.onHead = function () {
    var w = OB.where(); if (!w.head) return;
    var seen = get("olymp-seen", {}); if (seen[w.head]) return;
    seen[w.head] = 1; set("olymp-seen", seen);
  };

  // ---- отметки абзацев ---------------------------------------------------
  var markBtn = document.getElementById("mark-mode"), marking = false, blocks = null;
  function hashOf(t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function keyOf(el) { return el.closest(".chapter").id + ":" + hashOf(norm(el.textContent).replace(/\s+/g, " ").trim().slice(0, 90)); }
  function markable(el) { return el && !el.closest("#home") && !el.closest(".quiz-go, .toc, .nav, table, .find") && !(el.tagName === "LI" && el.querySelector("p, li")); }
  function allBlocks() {
    if (blocks) return blocks;
    blocks = {};
    [].forEach.call(document.querySelectorAll(".chapter p, .chapter li"), function (el) { if (markable(el)) blocks[keyOf(el)] = el; });
    return blocks;
  }
  function paintMarks() {
    var marks = get("olymp-marks", {}), all = allBlocks();
    Object.keys(all).forEach(function (k) { all[k].classList.remove("mk-learn", "mk-ask"); if (marks[k]) all[k].classList.add(marks[k].kind === "ask" ? "mk-ask" : "mk-learn"); });
  }
  markBtn.addEventListener("click", function () {
    marking = !marking;
    markBtn.setAttribute("aria-pressed", marking ? "true" : "false");
    markBtn.textContent = marking ? "Готово" : "Отметить";
    document.body.classList.toggle("marking", marking);
    if (marking && OB.where().section === "home") location.hash = "format";
  });
  document.querySelector("main").addEventListener("click", function (e) {
    if (!marking || e.target.closest("a, button, input, summary, textarea")) return;
    var el = e.target.closest("p, li");
    if (!markable(el)) return;
    var marks = get("olymp-marks", {}), k = keyOf(el), m = marks[k];
    var head = null, n = el; while (n && !head) { n = n.previousElementSibling || n.parentElement; if (n && n.tagName === "H2") head = n; if (n && n.classList && n.classList.contains("chapter")) break; }
    if (!m) marks[k] = { kind: "learn", note: "", text: el.textContent.replace(/\s+/g, " ").trim().slice(0, 160), ch: el.closest(".chapter").id, head: head ? head.textContent : "" };
    else if (m.kind === "learn") m.kind = "ask";
    else delete marks[k];
    set("olymp-marks", marks); paintMarks();
  });

  // ---- «Старт» -----------------------------------------------------------
  var home = document.getElementById("home-body");
  function planDay() {
    var days = D.plan.days, i;
    for (i = 0; i < days.length; i++) if (days[i].date === TODAY) return days[i];
    return TODAY < days[0].date ? days[0] : null;
  }
  function itemButton(it) {
    if (it.go) return '<button type="button" class="h-go" data-go="' + it.go + '">Открыть</button>';
    if (it.quiz) return '<button type="button" class="h-go" data-quiz-id="' + it.quiz + '">Тест</button>';
    if (it.tool) return '<button type="button" class="h-go" data-tool="' + it.tool + '">Начать</button>';
    return "";
  }
  function planItems(day, done) {
    return day.items.map(function (it, i) {
      var k = day.date + ":" + i, id = "plan-" + k.replace(/[^0-9]/g, "");
      return '<li class="' + (done[k] ? "off" : "") + '"><input type="checkbox" id="' + id + '" data-plan="' + k + '"' + (done[k] ? " checked" : "") + '><label for="' + id + '">' + esc(it.text) + "</label>" + itemButton(it) + "</li>";
    }).join("");
  }
  function renderHome() {
    var done = get("olymp-plan-done", {}), day = planDay(), html = "";
    var left = Math.round((new Date(D.plan.eventDate + "T00:00:00") - new Date(TODAY + "T00:00:00")) / 86400000);
    html += "<!--HERO-->";

    // План на сегодня и то, что не закрыто с прошлых дней.
    if (day) {
      var closed = day.items.filter(function (_, i) { return done[day.date + ":" + i]; }).length;
      html += '<div class="h-card dark" id="plan-card"><div class="h-title"><span>' + (day.date === TODAY ? "Сегодня по плану" : "План на " + ruDate(day.date)) + '</span><span class="h-sub">' + closed + " из " + day.items.length + (day.hours ? " · около " + num(day.hours) + " ч" : "") + '</span></div><ul class="h-plan">' + planItems(day, done) + "</ul></div>";
    }
    var late = [];
    D.plan.days.forEach(function (d) { if (d.date < TODAY) d.items.forEach(function (it, i) { if (!done[d.date + ":" + i]) late.push({ d: d, i: i, it: it }); }); });
    if (late.length) {
      html += '<div class="h-card"><div class="h-title"><span>Перенесено с прошлых дней</span><span class="h-sub">' + late.length + '</span></div><ul class="h-plan">' + late.map(function (x) {
        var k = x.d.date + ":" + x.i, id = "plan-" + k.replace(/[^0-9]/g, "");
        return '<li><input type="checkbox" id="' + id + '" data-plan="' + k + '"><label for="' + id + '">' + esc(x.it.text) + ' <span class="h-sub">· ' + ruDate(x.d.date) + "</span></label>" + itemButton(x.it) + "</li>";
      }).join("") + "</ul></div>";
    }

    // Повторение.
    var cards = dueCards(), due = cards.filter(function (c) { return c.due <= TODAY; }).length;
    html += '<div class="h-card"><div class="h-title"><span>Повторение</span><span class="h-sub">в колоде ' + cards.length + "</span></div>" +
      '<p class="h-sub" style="margin:6px 0 10px">' + (due ? "Сегодня пора повторить " + due + " " + word(due, "термин", "термина", "терминов") + ", в которых ты ошибался." : cards.length ? "На сегодня повторять нечего. Ошибки из тестов вернутся сюда завтра, потом через 3 и 7 дней." : "Сюда попадают термины, в которых ты ошибся в тестах: они возвращаются завтра, потом через 3 и 7 дней.") + "</p>" +
      (due ? '<button type="button" class="q-btn" data-tool="repeat">Повторить сегодня</button>' : "") + "</div>";

    // Тренировки.
    var blitz = get("olymp-blitz", 0), cs = get("olymp-cases", {}), ec = get("olymp-econ", 0);
    html += '<div class="h-tools">' +
      '<button type="button" class="h-tool" data-tool="blitz"><b>Блиц «Верно — неверно»</b><span>60 секунд, суждения с подвохом из олимпиад' + (blitz ? " · рекорд " + blitz : "") + "</span></button>" +
      '<button type="button" class="h-tool" data-tool="cases"><b>Разбор дела</b><span>объект, стороны, субъект, вина — по шагам · пройдено ' + Object.keys(cs).length + " из " + D.cases.length + "</span></button>" +
      '<button type="button" class="h-tool" data-tool="econ"><b>Экономические задачи</b><span>каждый раз новые числа, решение по шагам' + (ec ? " · решено " + ec : "") + "</span></button>" +
      '<button type="button" class="h-tool" data-tool="tour2"><b>Второй тур</b><span>текст и вопросы на 60 минут, затем самопроверка</span></button>' +
      '<a class="h-tool" href="#cheat"><b>Шпаргалка на утро</b><span>формулы, числа, полномочия на одной странице</span></a>' +
      '<div class="h-tool" style="cursor:default"><b>Пробный первый тур</b><span>40 минут с обратным отсчётом — в приложении: «Тренажёр» → ВсОШ</span></div>' +
      "</div>";

    // Дорога знаний: станция на раздел, точки — главы, в конце — олимпиада.
    var seen = get("olymp-seen", {}), sc = OB.scores(), good = 0, total = 0, st = [], nowSet = false;
    OB.chapters.forEach(function (ch) {
      if (ch.id === "home" || ch.id === "plan" || ch.id === "cheat") return;
      var g = 0, touched = 0, hs = ch.querySelectorAll("h2");
      var dots = [].map.call(hs, function (h) {
        var s = sc[h.id], best = s ? Math.max.apply(null, Object.keys(s).map(function (k) { return s[k]; })) : 0;
        var cls = best >= 80 ? "good" : best > 0 ? "mid" : seen[h.id] ? "seen" : "";
        total++; if (best >= 80) { good++; g++; } if (cls) touched++;
        return '<a href="#' + h.id + '" class="' + cls + '" title="' + esc(h.textContent) + (best ? " — тест " + best + "%" : "") + '" aria-label="' + esc(h.textContent) + '"></a>';
      }).join("");
      var done = hs.length > 0 && g === hs.length, now = !done && !nowSet;
      if (now) nowSet = true;
      st.push({ id: ch.id, name: document.querySelector('.tabs a[data-tab="' + ch.id + '"]').textContent, dots: dots, g: g, n: hs.length, cls: done ? "done" : now ? "now" : touched ? "part" : "", done: done, now: now });
    });
    var ROW = 112, TOP = 46, H = TOP + st.length * ROW + 40, xs = st.map(function (_, i) { return i % 2 ? 84 : 16; }).concat([50]);
    var segs = "", lanes = "";
    xs.forEach(function (x, i) {
      if (!i) return;
      var y0 = TOP + (i - 1) * ROW, y1 = TOP + i * ROW, d = "M" + xs[i - 1] + " " + y0 + " C" + xs[i - 1] + " " + (y0 + ROW * 0.62) + " " + x + " " + (y1 - ROW * 0.62) + " " + x + " " + y1;
      segs += '<path d="' + d + '" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-width="16" stroke="' + (st[i - 1].done ? "var(--green)" : "var(--line)") + '"/>';
      lanes += '<path d="' + d + '" fill="none" vector-effect="non-scaling-stroke" stroke-width="2" stroke-dasharray="7 9" stroke="var(--panel)"/>';
    });
    var road = '<svg viewBox="0 0 100 ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + segs + lanes + "</svg>" + st.map(function (s, i) {
      return '<div class="rd-st ' + (i % 2 ? "r " : "") + s.cls + '" style="top:' + (TOP + i * ROW) + 'px"><a class="rd-node" href="#' + s.id + '" aria-label="' + esc(s.name) + '">' + (s.now ? '<span class="rd-here">ты здесь</span>' : "") + (s.done ? "✓" : i + 1) + '</a><div class="rd-lab"><a href="#' + s.id + '">' + esc(s.name) + "</a><small>" + s.g + " из " + s.n + " " + word(s.n, "главы", "глав", "глав") + ' на зелёном</small><span class="rd-dots">' + s.dots + "</span></div></div>";
    }).join("") + '<div class="rd-st fin" style="top:' + (TOP + st.length * ROW) + 'px"><div class="rd-fin">Олимпиада<small>' + ruDate(D.plan.eventDate) + "</small></div></div>";
    var pct = total ? Math.round(good / total * 100) : 0;
    html = html.replace("<!--HERO-->", '<div class="hero"><div class="hero-n">' + (left > 0 ? left : left === 0 ? "★" : "✓") + '</div><div class="hero-t"><b>' + (left > 0 ? word(left, "день", "дня", "дней") + " до олимпиады" : left === 0 ? "Олимпиада сегодня. Удачи!" : "Муниципальный этап позади") + "</b><span>" + (left >= 0 ? ruDate(D.plan.eventDate) + " · " : "учебник остаётся для повторения · ") + "пройдено " + pct + ' % дороги</span><div class="hero-bar"><i style="width:' + pct + '%"></i></div></div></div>');
    html += '<div class="h-card"><div class="h-title"><span>Дорога знаний</span><span class="h-sub">' + good + " из " + total + ' глав на зелёном</span></div><p class="h-sub" style="margin:6px 0 0">Станция — раздел, точки — главы. Глава зеленеет, когда тест по ней сдан на 80 % и выше; станция — когда зелёные все её главы.</p><div class="map" style="height:' + H + 'px">' + road +
      '</div><div class="legend"><span><i style="background:var(--line)"></i>не открывал</span><span><i style="background:var(--barMute)"></i>читал</span><span><i style="background:var(--accent)"></i>тест ниже 80 %</span><span><i style="background:var(--green)"></i>тест от 80 %</span></div></div>';

    // Отметки.
    var marks = get("olymp-marks", {}), keys = Object.keys(marks);
    html += '<div class="h-card"><div class="h-title"><span>Мои отметки</span><span class="h-sub">' + keys.length + "</span></div>" +
      (keys.length ? '<ul class="mk-list">' + keys.map(function (k) {
        var m = marks[k], tab = document.querySelector('.tabs a[data-tab="' + m.ch + '"]');
        return '<li class="' + (m.kind === "ask" ? "mk-ask" : "mk-learn") + '"><small>' + (m.kind === "ask" ? "Не понял" : "Выучить") + " · " + esc(tab ? tab.textContent : "") + (m.head ? " › " + esc(m.head) : "") + "</small>" + esc(m.text) +
          '<div class="row"><input data-note="' + k + '" value="' + esc(m.note || "") + '" placeholder="Своя заметка" aria-label="Заметка к отметке"><button type="button" class="h-go" data-mark-go="' + k + '">Открыть</button><button type="button" class="h-go" data-mark-del="' + k + '">Убрать</button></div></li>';
      }).join("") + "</ul>" : '<p class="h-sub" style="margin:6px 0 0">Нажми «Отметить» в шапке и касайся абзацев: первое касание — «выучить», второе — «не понял», третье снимает отметку. Всё отмеченное собирается здесь.</p>') + "</div>";
    home.innerHTML = html;
  }
  home.addEventListener("change", function (e) {
    var k = e.target.getAttribute("data-plan"), n = e.target.getAttribute("data-note");
    if (k) { var done = get("olymp-plan-done", {}); if (e.target.checked) done[k] = 1; else delete done[k]; set("olymp-plan-done", done); renderHome(); }
    if (n) { var marks = get("olymp-marks", {}); if (marks[n]) { marks[n].note = e.target.value; set("olymp-marks", marks); } }
  });
  var TOOLS = { repeat: openRepeat, blitz: openBlitz, cases: openCases, econ: openEcon, tour2: openTour2 };
  home.addEventListener("click", function (e) {
    var b = e.target.closest("[data-go], [data-quiz-id], [data-tool], [data-mark-go], [data-mark-del]");
    if (!b) return;
    if (b.hasAttribute("data-go")) location.hash = b.getAttribute("data-go");
    else if (b.hasAttribute("data-quiz-id")) { if (OB.quizSets[b.getAttribute("data-quiz-id")]) OB.openQuiz(b.getAttribute("data-quiz-id")); }
    else if (b.hasAttribute("data-tool")) TOOLS[b.getAttribute("data-tool")]();
    else if (b.hasAttribute("data-mark-del")) { var marks = get("olymp-marks", {}); delete marks[b.getAttribute("data-mark-del")]; set("olymp-marks", marks); paintMarks(); renderHome(); }
    else {
      var k = b.getAttribute("data-mark-go"), el = allBlocks()[k];
      if (!el) return;
      var ch = el.closest(".chapter");
      if (ch.hidden) { OB.pendingEl = el; location.hash = ch.id; } else { el.scrollIntoView({ block: "center" }); OB.flash(el); }
    }
  });
  OB.onShow = function (id) {
    if (id === "home") renderHome();
    if (OB.pendingEl) { var el = OB.pendingEl; OB.pendingEl = null; setTimeout(function () { el.scrollIntoView({ block: "center" }); OB.flash(el); }, 30); }
  };

  // ---- блиц ----------------------------------------------------------------
  function openBlitz() {
    var body = sheet("Блиц «Верно — неверно»"), best = get("olymp-blitz", 0), S;
    function start() {
      S = { items: shuffle(D.yesno), i: 0, right: 0, streak: 0, top: 0, miss: [], left: 60 };
      timers.push(setInterval(function () { S.left -= 1; var t = document.getElementById("bz-left"); if (t) t.textContent = S.left; if (S.left <= 0) end(); }, 1000));
      ask();
    }
    function ask() {
      if (S.i >= S.items.length) return end();
      body.innerHTML = '<div class="q-timer"><span>Осталось <b id="bz-left">' + S.left + "</b> с</span><span>верно " + S.right + " · серия " + S.streak + '</span></div><div class="q-big">' + esc(S.items[S.i].t) +
        '</div><div class="q-row"><button type="button" class="q-btn ghost" data-do="bz" data-v="1">Верно</button><button type="button" class="q-btn ghost" data-do="bz" data-v="0">Неверно</button></div>';
    }
    function end() {
      timers.forEach(clearInterval); timers = [];
      if (S.right > best) { best = S.right; set("olymp-blitz", best); }
      body.innerHTML = '<div class="q-end"><div class="n">' + S.right + '</div><div>верных ответов за минуту · лучшая серия ' + S.top + " · рекорд " + best + "</div>" +
        (S.miss.length ? '<ul class="q-miss">' + S.miss.map(function (m) { return "<li>" + esc(m.t) + " — <b>" + (m.ok ? "верно" : "неверно") + '</b> <span class="h-sub">(' + esc(m.src) + ")</span></li>"; }).join("") + "</ul>" : "") +
        '<div class="q-row" style="width:100%"><button type="button" class="q-btn" data-do="bz-start">Ещё раз</button><button type="button" class="q-btn ghost" data-do="close">К учебнику</button></div></div>';
    }
    handlers.bz = function (b) {
      var it = S.items[S.i], ok = (b.getAttribute("data-v") === "1") === it.ok;
      if (ok) { S.right++; S.streak++; S.top = Math.max(S.top, S.streak); } else { S.streak = 0; S.miss.push(it); }
      S.i++; ask();
    };
    handlers["bz-start"] = start; handlers.close = closeTool;
    body.innerHTML = '<div class="q-end"><div class="n">60 с</div><div>Суждения из школьных и муниципальных этапов ВсОШ. Отвечай быстро: верно или неверно. Ошибки покажу в конце.' + (best ? " Рекорд — " + best + "." : "") +
      '</div><button type="button" class="q-btn" data-do="bz-start">Начать</button></div>';
  }

  // ---- разбор дела ---------------------------------------------------------
  function openCases() {
    var body = sheet("Разбор дела"), C, step, right;
    function list() {
      var cs = get("olymp-cases", {});
      body.innerHTML = '<p class="h-sub" style="margin:0">Короткое дело — и по шагам: объект, объективная сторона, субъект, вина, вид ответственности. Теория — в разделе «Теория права», первая глава.</p><div class="q-opts">' +
        D.cases.map(function (c, i) { return '<button type="button" class="q-opt" data-do="case" data-i="' + i + '"><b>' + esc(c.title) + "</b>" + (cs[i] !== undefined ? ' <span class="h-sub">· ' + cs[i] + " из " + c.steps.length + "</span>" : "") + "</button>"; }).join("") + "</div>";
    }
    function show() {
      var s = C.steps[step];
      body.innerHTML = '<div class="q-prog"><span>Шаг ' + (step + 1) + " из " + C.steps.length + "</span><span>верно: " + right + '</span></div><div class="q-ask"><small>Дело</small>' + esc(C.text) + '</div><div class="q-ask"><small>Вопрос</small><b>' + esc(s.q) + '</b></div><div class="q-opts">' +
        s.options.map(function (o, i) { return '<button type="button" class="q-opt" data-do="case-pick" data-i="' + i + '">' + esc(o) + "</button>"; }).join("") + "</div>";
    }
    handlers.case = function (b) { C = D.cases[Number(b.getAttribute("data-i"))]; C.i = Number(b.getAttribute("data-i")); step = 0; right = 0; show(); };
    handlers["case-pick"] = function (b) {
      var s = C.steps[step], ok = Number(b.getAttribute("data-i")) === s.ok;
      if (ok) right++;
      [].forEach.call(body.querySelectorAll('[data-do="case-pick"]'), function (x, i) { x.disabled = true; if (i === s.ok) x.classList.add("ok"); });
      if (!ok) b.classList.add("bad");
      var box = document.createElement("div");
      box.innerHTML = '<div class="q-note">' + esc(s.why) + '</div><button type="button" class="q-btn" data-do="case-next" style="width:100%;margin-top:10px">' + (step === C.steps.length - 1 ? "К итогу" : "Дальше") + "</button>";
      body.appendChild(box); box.querySelector("button").focus();
    };
    handlers["case-next"] = function () {
      step++;
      if (step < C.steps.length) return show();
      var cs = get("olymp-cases", {}); cs[C.i] = Math.max(cs[C.i] || 0, right); set("olymp-cases", cs);
      body.innerHTML = '<div class="q-end"><div class="n">' + right + " из " + C.steps.length + '</div><div>«' + esc(C.title) + '» разобрано.</div><div class="q-row" style="width:100%"><button type="button" class="q-btn" data-do="case-list">Другое дело</button><button type="button" class="q-btn ghost" data-do="close">К учебнику</button></div></div>';
    };
    handlers["case-list"] = list; handlers.close = closeTool;
    list();
  }

  // ---- экономические задачи с новыми числами -------------------------------
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(a) { return a[ri(0, a.length - 1)]; }
  function k(x) { return x === 1 ? "" : x; }
  var ECON = [
    { name: "Равновесная цена", make: function () {
      var P = ri(4, 30), b = ri(1, 5), c = ri(1, 5), Q = ri(10, 80), a = Q + b * P, d = c * P - Q;
      if (d <= 0) { c += Math.ceil((Q + 1) / P); d = c * P - Q; }
      return { text: "Спрос на товар: Qd = " + a + " − " + k(b) + "P, предложение: Qs = " + k(c) + "P − " + d + ". Найдите равновесную цену.", answer: P,
        steps: ["В равновесии Qd = Qs: " + a + " − " + k(b) + "P = " + k(c) + "P − " + d + ".", (a + d) + " = " + (b + c) + "P, откуда P = " + P + ".", "Проверка: Q = " + a + " − " + b + " × " + P + " = " + Q + "."] };
    } },
    { name: "Дефицит при потолке цены", make: function () {
      var P = ri(10, 30), b = ri(1, 4), c = ri(2, 5), Q = ri(20, 80), a = Q + b * P, d = c * P - Q;
      if (d <= 0) { c += Math.ceil((Q + 1) / P); d = c * P - Q; }
      var p = P - ri(2, 6), qd = a - b * p, qs = c * p - d;
      if (qs < 0) return this.make();
      return { text: "Спрос: Qd = " + a + " − " + k(b) + "P, предложение: Qs = " + k(c) + "P − " + d + ". Государство установило максимальную цену " + p + ". Каков размер дефицита?", answer: qd - qs,
        steps: ["При цене " + p + ": Qd = " + a + " − " + b + " × " + p + " = " + qd + ".", "Qs = " + c + " × " + p + " − " + d + " = " + qs + ".", "Дефицит = Qd − Qs = " + (qd - qs) + ". Цена ниже равновесной (" + P + "), поэтому товара не хватает."] };
    } },
    { name: "Налог на продавца", make: function () {
      var b = ri(1, 4), c = ri(1, 4), t = (b + c) * ri(1, 3), P = ri(10, 30), Q = ri(30, 90), a = Q + b * P, d = c * P - Q;
      if (d <= 0) { c += Math.ceil((Q + 1) / P); d = c * P - Q; t = (b + c) * ri(1, 3); }
      var p2 = (a + d + c * t) / (b + c);
      return { text: "Спрос: Qd = " + a + " − " + k(b) + "P, предложение: Qs = " + k(c) + "P − " + d + ". Введён налог " + t + " с каждой единицы, платят продавцы. Какую цену теперь платит покупатель?", answer: p2,
        steps: ["Продавцу остаётся P − " + t + ", поэтому Qs = " + c + "(P − " + t + ") − " + d + " = " + c + "P − " + (c * t + d) + ".", a + " − " + k(b) + "P = " + c + "P − " + (c * t + d) + " → P = " + num(p2) + ".", "До налога цена была " + P + ": покупатель платит на " + num(p2 - P) + " больше, продавец получает на " + num(t - (p2 - P)) + " меньше."] };
    } },
    { name: "Уровень безработицы", make: function () {
      var E = ri(40, 90) * 10, U = ri(3, 12) * 5, out = ri(10, 40) * 10, r = U / (E + U) * 100;
      return { text: "В стране " + E + " тыс. занятых, " + U + " тыс. безработных и " + out + " тыс. человек вне рабочей силы (студенты-очники, пенсионеры). Найдите уровень безработицы в процентах. Ответ округлите до десятых.", answer: Math.round(r * 10) / 10, tol: 0.06, unit: "%",
        steps: ["Рабочая сила = занятые + безработные = " + (E + U) + " тыс.", "Уровень безработицы = " + U + " : " + (E + U) + " × 100 % = " + num(Math.round(r * 10) / 10) + " %.", "Те, кто вне рабочей силы, в расчёт не входят."] };
    } },
    { name: "Дефицит бюджета в % ВВП", make: function () {
      var inc = ri(60, 120) * 10, exp = inc + ri(4, 20) * 10, gdp = pick([2000, 2500, 4000, 5000, 8000]);
      return { text: "Доходы бюджета — " + inc + " млрд, расходы — " + exp + " млрд, ВВП — " + gdp + " млрд. Сколько процентов ВВП составляет дефицит бюджета?", answer: (exp - inc) / gdp * 100, tol: 0.01, unit: "%",
        steps: ["Дефицит = расходы − доходы = " + (exp - inc) + " млрд.", "В процентах ВВП: " + (exp - inc) + " : " + gdp + " × 100 % = " + num((exp - inc) / gdp * 100) + " %."] };
    } },
    { name: "Скорость обращения денег", make: function () {
      var V = ri(3, 10), M = ri(2, 9) * 100, P = pick([2, 4, 5, 10]), Q = M * V / P;
      return { text: "Денежная масса — " + M + ", уровень цен — " + P + ", реальный выпуск — " + Q + ". Найдите скорость обращения денег.", answer: V,
        steps: ["Уравнение обмена: M × V = P × Q.", "V = P × Q : M = " + P + " × " + Q + " : " + M + " = " + V + "."] };
    } },
    { name: "Темп инфляции", make: function () {
      var i0 = pick([100, 120, 125, 150, 200]), g = pick([5, 8, 10, 12, 20, 25]), i1 = i0 * (1 + g / 100);
      return { text: "Индекс цен в прошлом году — " + i0 + ", в этом — " + num(i1) + ". Каков темп инфляции в процентах?", answer: g, unit: "%",
        steps: ["Темп инфляции = (I₁ − I₀) : I₀ × 100 %.", "(" + num(i1) + " − " + i0 + ") : " + i0 + " × 100 % = " + g + " %."] };
    } },
    { name: "Реальный ВВП", make: function () {
      var g = pick([10, 20, 25, 50]), real = ri(8, 40) * 100, nom = real * (1 + g / 100);
      return { text: "Номинальный ВВП — " + num(nom) + ". Цены по сравнению с базовым годом выросли на " + g + " %. Найдите реальный ВВП.", answer: real,
        steps: ["Индекс цен = 1 + " + g + " % = " + num(1 + g / 100) + ".", "Реальный ВВП = номинальный : индекс цен = " + num(nom) + " : " + num(1 + g / 100) + " = " + real + "."] };
    } },
    { name: "Сложные проценты", make: function () {
      var P = ri(1, 9) * 100, r = pick([5, 10, 20]), n = pick([2, 3]), S = P * Math.pow(1 + r / 100, n);
      return { text: "Вклад " + P + " тыс. рублей положили под " + r + " % годовых на " + n + " года с ежегодной капитализацией. Сколько тысяч рублей будет на вкладе в конце? Ответ округлите до сотых.", answer: Math.round(S * 100) / 100, tol: 0.006,
        steps: ["Сложные проценты: S = P × (1 + r)ⁿ.", P + " × " + num(1 + r / 100) + "^" + n + " = " + num(S) + " тыс.", "При простых процентах было бы " + num(P * (1 + r / 100 * n)) + " тыс."] };
    } },
    { name: "Экономическая прибыль", make: function () {
      var rev = ri(15, 40) * 100, exp = ri(5, 12) * 100, wage = ri(4, 9) * 100, cap = ri(5, 20) * 100, r = pick([5, 10, 20]), imp = wage + cap * r / 100;
      return { text: "Предприниматель ушёл с работы с зарплатой " + wage + " тыс. в год и вложил в дело " + cap + " тыс. своих денег, которые могли бы лежать в банке под " + r + " %. Выручка за год — " + rev + " тыс., явные расходы — " + exp + " тыс. Найдите экономическую прибыль в тыс. рублей.", answer: rev - exp - imp,
        steps: ["Бухгалтерская прибыль = " + rev + " − " + exp + " = " + (rev - exp) + " тыс.", "Неявные издержки: упущенная зарплата " + wage + " + упущенный процент " + cap + " × " + r + " % = " + num(cap * r / 100) + " → всего " + num(imp) + " тыс.", "Экономическая прибыль = " + (rev - exp) + " − " + num(imp) + " = " + num(rev - exp - imp) + " тыс."] };
    } },
    { name: "НДФЛ по прогрессивной шкале", make: function () {
      var inc = pick([2600, 2800, 3000, 3400, 3600, 4000, 4400, 5000]), tax = 2400 * 0.13 + (inc - 2400) * 0.15;
      return { text: "Годовой доход работника — " + inc + " тыс. рублей. Ставка НДФЛ: 13 % с дохода до 2 400 тыс. и 15 % с части от 2 400 до 5 000 тыс. Сколько тысяч рублей налога он заплатит?", answer: tax,
        steps: ["С первых 2 400 тыс.: 2 400 × 13 % = 312 тыс.", "С превышения " + (inc - 2400) + " тыс.: × 15 % = " + num((inc - 2400) * 0.15) + " тыс.", "Всего " + num(tax) + " тыс. Повышенная ставка действует только на превышение."] };
    } },
    { name: "Точка безубыточности", make: function () {
      var avc = ri(2, 12) * 10, m = ri(2, 10) * 10, P = avc + m, Q = ri(5, 40) * 10, FC = Q * m;
      return { text: "Постоянные издержки фирмы — " + FC + ", цена единицы товара — " + P + ", средние переменные издержки — " + avc + ". Сколько единиц нужно продать, чтобы выйти в ноль?", answer: Q,
        steps: ["Каждая единица приносит сверх своих затрат P − AVC = " + m + ".", "Q = FC : (P − AVC) = " + FC + " : " + m + " = " + Q + "."] };
    } },
    { name: "Прибыль монополиста", make: function () {
      var mc = ri(1, 6) * 10, a = mc + ri(2, 8) * 20, Q = (a - mc) / 2, P = a - Q;
      return { text: "Спрос на товар монополиста: P = " + a + " − Q. Предельные издержки постоянны и равны " + mc + ", постоянных издержек нет. Какую цену установит монополист?", answer: P,
        steps: ["Предельная выручка для P = a − Q: MR = " + a + " − 2Q.", "MR = MC: " + a + " − 2Q = " + mc + " → Q = " + Q + ".", "Цена по спросу: P = " + a + " − " + Q + " = " + P + ". Прибыль = (" + P + " − " + mc + ") × " + Q + " = " + (P - mc) * Q + "."] };
    } }
  ];
  function openEcon() {
    var body = sheet("Экономические задачи"), T = null, kind = -1, cur = null;
    function menu() {
      body.innerHTML = '<p class="h-sub" style="margin:0">Числа каждый раз новые. Реши на черновике, впиши ответ — покажу решение по шагам.</p><div class="q-opts"><button type="button" class="q-opt" data-do="ec" data-i="-1"><b>Случайная задача</b></button>' +
        ECON.map(function (g, i) { return '<button type="button" class="q-opt" data-do="ec" data-i="' + i + '">' + esc(g.name) + "</button>"; }).join("") + "</div>";
    }
    function ask() {
      T = kind < 0 ? pick(ECON) : ECON[kind]; cur = T.make();
      body.innerHTML = '<div class="q-prog"><span>' + esc(T.name) + '</span><button type="button" class="h-go" data-do="ec-menu">Все типы</button></div><div class="q-ask">' + esc(cur.text) + '</div><input class="q-input" id="ec-answer" inputmode="decimal" autocomplete="off" aria-label="Ответ"><div class="q-row"><button type="button" class="q-btn ghost" data-do="ec-show">Показать решение</button><button type="button" class="q-btn" data-do="ec-check">Проверить</button></div>';
      var inp = document.getElementById("ec-answer"); inp.focus();
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") handlers["ec-check"](); });
    }
    function reveal(ok, typed) {
      [].forEach.call(body.querySelectorAll('[data-do="ec-check"], [data-do="ec-show"]'), function (b) { b.disabled = true; });
      if (ok) set("olymp-econ", get("olymp-econ", 0) + 1);
      var box = document.createElement("div");
      box.innerHTML = '<div class="q-note">' + (typed === null ? "Ответ: " : ok ? "Верно: " : "Неверно. Правильный ответ: ") + "<b>" + num(cur.answer) + (cur.unit ? " " + cur.unit : "") + '</b></div><ol class="q-steps" style="margin-top:10px">' + cur.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + '</ol><button type="button" class="q-btn" data-do="ec-next" style="width:100%;margin-top:10px">Ещё задача</button>';
      body.appendChild(box); box.querySelector("button").focus();
    }
    handlers.ec = function (b) { kind = Number(b.getAttribute("data-i")); ask(); };
    handlers["ec-menu"] = menu; handlers["ec-next"] = ask;
    handlers["ec-show"] = function () { reveal(false, null); };
    handlers["ec-check"] = function () {
      var raw = document.getElementById("ec-answer").value.replace(/\s/g, "").replace(",", ".").replace("%", "");
      if (raw === "" || isNaN(Number(raw))) return;
      reveal(Math.abs(Number(raw) - cur.answer) <= (cur.tol || 0.005) + 1e-9, raw);
    };
    menu();
  }

  // ---- второй тур ----------------------------------------------------------
  function openTour2() {
    var body = sheet("Второй тур: тренировка"), all = get("olymp-tour2", {}), idx = 0;
    function save() { set("olymp-tour2", all); }
    function list() {
      body.innerHTML = '<p class="h-sub" style="margin:0">Текст и вопросы, как во втором туре: 60 минут на развёрнутые ответы. После — самопроверка по тому, что должно быть в ответе. Ответы сохраняются на этом устройстве.</p><div class="q-opts">' +
        D.tour2.map(function (t, i) { var st = all[i]; return '<button type="button" class="q-opt" data-do="t2" data-i="' + i + '"><b>' + esc(t.title) + "</b>" + (st ? ' <span class="h-sub">· ' + (st.done ? "завершён" : "начат") + "</span>" : "") + "</button>"; }).join("") + "</div>";
    }
    function left(st) { return Math.max(0, Math.round((st.until - Date.now()) / 1000)); }
    function run() {
      var t = D.tour2[idx], st = all[idx];
      body.innerHTML = '<div class="q-timer"><span>Осталось <b id="t2-left"></b></span><button type="button" class="h-go" data-do="t2-end" style="color:inherit;border-color:currentColor">Завершить</button></div><div class="q-text">' +
        t.text.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>" +
        t.questions.map(function (q, i) { return '<div class="q-ask"><small>Вопрос ' + (i + 1) + "</small>" + esc(q.q) + '</div><textarea class="q-area" data-a="' + i + '" aria-label="Ответ на вопрос ' + (i + 1) + '">' + esc(st.answers[i] || "") + "</textarea>"; }).join("");
      function tick() { var s = left(st), el = document.getElementById("t2-left"); if (el) el.textContent = Math.floor(s / 60) + ":" + pad(s % 60); if (s <= 0) finish(); }
      tick(); timers.push(setInterval(tick, 1000));
    }
    function finish() {
      timers.forEach(clearInterval); timers = [];
      var t = D.tour2[idx], st = all[idx]; st.done = true; save();
      body.innerHTML = '<div class="q-note">Тур завершён. Сравни каждый ответ с тем, что в нём должно быть, и отметь выполненное. Баллы на олимпиаде дают за каждый элемент ответа.</div>' +
        t.questions.map(function (q, i) {
          return '<div class="q-ask"><small>Вопрос ' + (i + 1) + "</small><b>" + esc(q.q) + '</b><p style="margin:8px 0;white-space:pre-wrap">' + (st.answers[i] ? esc(st.answers[i]) : '<span class="h-sub">ответа нет</span>') + '</p><div class="q-note"><b>Должно быть:</b> ' + esc(q.need) + "</div></div>";
        }).join("") +
        '<div class="h-card"><div class="h-title"><span>Самопроверка</span></div><ul class="h-plan">' +
        ["Аргументы и примеры пронумерованы", "Каждый пример конкретный: страна, год, закон, явление", "В каждом ответе есть термины курса", "Определения даны по схеме «род + отличия»", "Нет пересказа текста вместо ответа", "Уложился во время и оставил минуты на проверку"].map(function (c, i) { return '<li><input type="checkbox" id="t2c' + i + '"><label for="t2c' + i + '">' + c + "</label></li>"; }).join("") +
        '</ul></div><div class="q-row"><button type="button" class="q-btn" data-do="t2-again">Пройти заново</button><button type="button" class="q-btn ghost" data-do="t2-list">Другой текст</button></div>';
    }
    body.addEventListener("input", function (e) { var a = e.target.getAttribute && e.target.getAttribute("data-a"); if (a !== null && a !== undefined && all[idx]) { all[idx].answers[Number(a)] = e.target.value; save(); } });
    handlers.t2 = function (b) {
      idx = Number(b.getAttribute("data-i"));
      var st = all[idx];
      if (st && st.done) return finish();
      if (st && left(st) > 0) return run();
      body.innerHTML = '<div class="q-end"><div class="n">60 минут</div><div>«' + esc(D.tour2[idx].title) + "». Отсчёт начнётся сразу. Пиши так, как писал бы в чистовик: с номерами пунктов.</div><button type=\"button\" class=\"q-btn\" data-do=\"t2-start\">Начать</button></div>";
    };
    handlers["t2-start"] = function () { all[idx] = { until: Date.now() + 3600000, answers: [], done: false }; save(); run(); };
    handlers["t2-again"] = function () { delete all[idx]; save(); handlers.t2({ getAttribute: function () { return String(idx); } }); };
    handlers["t2-end"] = finish; handlers["t2-list"] = list;
    list();
  }

  paintMarks();
  renderHome();
})();
