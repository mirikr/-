import React, { useEffect, useState } from "react";
import BalanceChart from "./balance-chart.jsx";

// «Распределение времени (КПВ)» — варианты B и C вместе.
//
// Раньше экран был одной длинной карточкой: семь полей минут на всю ширину, у
// каждого предмета ползунок, число и вторая полоса «план / рекомендую» (про
// одно и то же), а вывод — «превышен бюджет», «может не хватить» — абзацем в
// самом низу. Теперь слева то, что человек задаёт, по шагам (① сколько могу в
// день, ② часы по предметам — неделя одной полосой и плитки), справа — что из
// этого получается: три проверки с подсказкой и КПВ, баланс предметов.
// Настройки и расчёты те же, поменялся только вид.

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_SHORT = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
const DAY_NAME = { mon: "Понедельник", tue: "Вторник", wed: "Среда", thu: "Четверг", fri: "Пятница", sat: "Суббота", sun: "Воскресенье" };
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// Шаг кнопок: у дня — четверть часа, у предмета — полчаса. Точнее можно
// вписать руками в само число.
const DAY_STEP = 15;
const ALLOC_STEP = 0.5;

const round1 = (n) => Math.round(n * 10) / 10;
const num = (n) => String(round1(n)).replace(".", ",");
const hours = (n) => num(n) + " ч";
// У дня шаг — четверть часа, и «1,3 ч» вместо 1 ч 15 мин было бы неправдой.
const dayHours = (m) => String(Math.round((m / 60) * 100) / 100).replace(".", ",") + " ч";

function plural(n, one, few, many) {
  const last = n % 10;
  const two = n % 100;
  if (two >= 11 && two <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

// Число, которое можно и нажимать «− / +», и вписать руками — с запятой.
// Пока поле в фокусе, в нём черновик: иначе «1,» превращалось бы в «1» на
// каждой букве.
function NumField({ value, onCommit, label, className, style, exact }) {
  const [draft, setDraft] = useState(null);
  const shown = draft === null ? (exact ? String(Math.round(value * 100) / 100).replace(".", ",") : num(value)) : draft;
  const parse = (text) => {
    const clean = String(text).replace(",", ".").replace(/[^\d.]/g, "");
    const n = Number(clean);
    return clean !== "" && Number.isFinite(n) ? Math.max(0, n) : null;
  };
  // Сохраняем на каждом вводе, а не только при уходе из поля: вписали «2,5» и
  // сразу ушли на другой экран — число не должно потеряться.
  function type(text) {
    setDraft(text);
    const n = parse(text);
    if (n !== null) onCommit(n);
  }
  function commit() {
    setDraft(null);
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={shown}
      onChange={(e) => type(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
        if (e.key === "Escape") setDraft(null);
      }}
      className={className}
      style={style}
    />
  );
}

function Stepper({ onMinus, onPlus, what, small }) {
  const s = small ? S.stepSmall : S.step;
  return [
    <button key="m" type="button" onClick={onMinus} style={s} aria-label={"Меньше: " + what}>
      −
    </button>,
    <button key="p" type="button" onClick={onPlus} style={s} aria-label={"Больше: " + what}>
      +
    </button>,
  ];
}

export default function BudgetScreen({ subjects, budget, onDaily, onAlloc, capacity, mainEvent, balance, formatDate, onEvents }) {
  const todayKey = DOW[new Date().getDay()];
  // На телефоне у дня нет своих кнопок — нажатие открывает правку под рядом.
  const [editDay, setEditDay] = useState(null);
  useEffect(() => {
    if (!editDay) return undefined;
    const t = setTimeout(() => setEditDay(null), 20000);
    return () => clearTimeout(t);
  }, [editDay, budget.daily]);

  const minutesOf = (k) => Number(budget.daily[k]) || 0;
  const maxDay = Math.max(60, ...DAYS.map(minutesOf));
  const weekBudget = capacity.weeklyBudget;
  const plan = round1(capacity.weeklyTotal);
  const byId = Object.fromEntries(balance.map((b) => [b.id, b]));
  const items = subjects.map((s) => ({ ...s, plan: Number(budget.alloc[s.id]) || 0, ...(byId[s.id] ? { fact: byId[s.id].fact, rec: byId[s.id].recommended } : { fact: 0, rec: 0 }) }));

  // Полоса недели: во всю ширину — большее из плана и бюджета.
  const scale = Math.max(plan, weekBudget, 1);
  const budgetAt = Math.min(100, (weekBudget / scale) * 100);
  const over = round1(plan - weekBudget);
  const free = round1(weekBudget - plan);

  // Проверки: неделя, событие, перекос. Каждая — вывод и что с ним делать.
  const extra = items
    .map((s) => ({ name: s.name, d: round1(s.plan - s.rec) }))
    .filter((x) => x.d >= 1)
    .sort((a, b) => b.d - a.d)
    .slice(0, 2);
  const checks = [];
  if (capacity.overBudget) {
    checks.push({
      ok: false,
      title: `Неделя не влезает: ${hours(plan)} из ${hours(weekBudget)}`,
      text:
        `Снимите ${hours(over)}` +
        (extra.length
          ? " — больше всего сверх рекомендации у " + extra.map((x) => `«${x.name}» (+${num(x.d)} ч)`).join(" и ") + "."
          : " в шаге ② или добавьте время в шаге ①."),
    });
  } else {
    checks.push({
      ok: true,
      title: `Неделя влезает: ${hours(plan)} из ${hours(weekBudget)}`,
      text: free > 0 ? `Свободно ${hours(free)} — можно отдать отстающему предмету.` : "Распределено ровно столько, сколько есть.",
    });
  }
  if (!mainEvent) {
    checks.push({
      ok: null,
      title: "Событие не выбрано",
      text: "Добавьте экзамен или олимпиаду — посчитаю, хватит ли времени до него.",
      go: onEvents,
    });
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.round((new Date(mainEvent.date + "T00:00:00") - today) / 86400000) + 1);
    const perWeek = round1((capacity.neededHours / days) * 7);
    const when = `${days} ${plural(days, "день", "дня", "дней")}, ${capacity.remainingTopics} ${plural(capacity.remainingTopics, "урок", "урока", "уроков")}`;
    checks.push(
      capacity.feasible
        ? {
            ok: true,
            title: `До «${mainEvent.name}» успеть: ${hours(capacity.totalCapacityHours)} из ${hours(capacity.neededHours)}`,
            text: `${when}, событие ${formatDate(mainEvent.date)}. Запас ${hours(capacity.totalCapacityHours - capacity.neededHours)}.`,
          }
        : {
            ok: false,
            title: `До «${mainEvent.name}» не успеть: ${hours(capacity.totalCapacityHours)} из ${hours(capacity.neededHours)}`,
            text: `${when}. Нужно ≈ ${hours(perWeek)} в неделю — добавьте часы в шаге ① или пересмотрите приоритеты.`,
          }
    );
  }
  checks.push(
    capacity.skew
      ? { ok: false, title: `Сильный уклон в «${capacity.skew.name}»`, text: `${capacity.skew.sharePct}% недели — не забывайте и про остальные предметы.` }
      : { ok: true, title: "Перекоса нет", text: "Ни один предмет не забирает больше 40% недели." }
  );
  const eventCheck = checks[1];

  return (
    <div className="ap-bud">
      {/* Телефон: два вывода сразу под заголовком — панель «Что получается»
          там ниже всех предметов. */}
      <div className="ap-bud-tiles">
        <div style={capacity.overBudget ? S.tileBad : S.tileOk}>
          <span style={S.tileLabel}>Неделя</span>
          <span style={S.tileBig}>
            {num(plan)} <span style={S.tileOf}>из {hours(weekBudget)}</span>
          </span>
          <span style={{ ...S.tileNote, color: capacity.overBudget ? "var(--red)" : "var(--green)" }}>
            {capacity.overBudget ? "перебор " + hours(over) : free > 0 ? "свободно " + hours(free) : "ровно"}
          </span>
        </div>
        {mainEvent ? (
          <div style={capacity.feasible ? S.tileOk : S.tileBad}>
            <span style={S.tileLabel}>До «{mainEvent.name}»</span>
            <span style={S.tileBig}>
              {num(capacity.totalCapacityHours)} <span style={S.tileOf}>из {hours(capacity.neededHours)}</span>
            </span>
            <span style={{ ...S.tileNote, color: capacity.feasible ? "var(--green)" : "var(--red)" }}>
              {capacity.feasible ? "успеваете" : "не хватит " + hours(capacity.neededHours - capacity.totalCapacityHours)}
            </span>
          </div>
        ) : (
          <div style={S.tileOk}>
            <span style={S.tileLabel}>Событие</span>
            <span style={{ ...S.tileNote, color: "var(--ink3)" }}>{eventCheck.text}</span>
          </div>
        )}
      </div>

      <div className="ap-bud-in">
        <section className="ap-card" aria-labelledby="bud-days" style={S.card}>
          <div style={S.head}>
            <h2 id="bud-days" style={S.h2}>
              <span style={S.stepNo}>1</span>Сколько могу в день
            </h2>
            <span style={S.headNote}>
              всего <b>{hours(weekBudget)}</b> в неделю
            </span>
          </div>
          <div className="ap-bud-days">
            {DAYS.map((k) => {
              const m = minutesOf(k);
              const today = k === todayKey;
              const on = editDay === k;
              return (
                <div
                  key={k}
                  className={"ap-bud-day" + (today ? " is-today" : "") + (on ? " is-on" : "")}
                  onClick={() => setEditDay(on ? null : k)}
                >
                  <div className="ap-bud-daybar">
                    <div style={{ ...S.dayBar, height: Math.max(3, (m / maxDay) * 100) + "%", background: today ? "var(--accent)" : "var(--ink2)" }} />
                  </div>
                  <span className="ap-bud-dayh">{dayHours(m)}</span>
                  <div className="ap-bud-dayctl" onClick={(e) => e.stopPropagation()}>
                    <Stepper small what={DAY_NAME[k]} onMinus={() => onDaily(k, Math.max(0, m - DAY_STEP))} onPlus={() => onDaily(k, m + DAY_STEP)} />
                  </div>
                  <span className="ap-bud-dayname" style={today ? S.dayToday : null}>
                    {DAY_SHORT[k]}
                  </span>
                </div>
              );
            })}
          </div>
          {editDay && (
            <div className="ap-bud-dayedit">
              <span style={S.dayEditName}>{DAY_NAME[editDay]}</span>
              <button type="button" onClick={() => onDaily(editDay, Math.max(0, minutesOf(editDay) - DAY_STEP))} style={S.step} aria-label="Меньше на 15 минут">
                −
              </button>
              <NumField
                value={minutesOf(editDay) / 60}
                onCommit={(h) => onDaily(editDay, Math.round(h * 60))}
                label={"Часов: " + DAY_NAME[editDay]}
                exact
                style={S.dayEditInput}
              />
              <span style={S.unit}>ч</span>
              <button type="button" onClick={() => onDaily(editDay, minutesOf(editDay) + DAY_STEP)} style={S.step} aria-label="Больше на 15 минут">
                +
              </button>
              <button type="button" onClick={() => setEditDay(null)} style={S.dayEditDone}>
                Готово
              </button>
            </div>
          )}
        </section>

        <section className="ap-card" aria-labelledby="bud-subjects" style={S.card}>
          <div style={S.head}>
            <h2 id="bud-subjects" style={S.h2}>
              <span style={S.stepNo}>2</span>Часы по предметам
            </h2>
            <span style={S.headNote}>
              план <b>{hours(plan)}</b>
            </span>
            <span style={capacity.overBudget ? S.badgeBad : S.badgeOk}>
              {capacity.overBudget ? "перебор " + hours(over) : free > 0 ? "свободно " + hours(free) : "ровно"}
            </span>
          </div>

          {subjects.length === 0 ? (
            <p style={S.muted}>Предметов пока нет — добавьте их в «Подготовке», и здесь появятся часы по ним.</p>
          ) : (
            <>
              <div style={S.weekWrap}>
                <div style={{ ...S.weekMark, left: budgetAt + "%" }} className="ap-bud-mark">
                  ▼ {hours(weekBudget)} <span className="ap-bud-marklong">— ваш бюджет</span>
                </div>
                <div style={S.week} role="img" aria-label={`План ${hours(plan)} из ${hours(weekBudget)}`}>
                  {items
                    .filter((s) => s.plan > 0)
                    .map((s) => (
                      <div key={s.id} style={{ ...S.seg, flexGrow: s.plan, background: s.color }} title={s.name + ": " + hours(s.plan)}>
                        <span className="ap-bud-segname" style={S.segName}>
                          {s.name}
                        </span>
                        <span style={S.segH}>{num(s.plan)}</span>
                      </div>
                    ))}
                  {free > 0 && <div style={{ ...S.segFree, flexGrow: free }} title={"Свободно " + hours(free)} />}
                </div>
                {capacity.overBudget && <div style={{ ...S.hatch, left: budgetAt + "%" }} aria-hidden="true" />}
              </div>

              <div className="ap-bud-cards">
                {items.map((s) => {
                  const off = Math.abs(s.plan - s.rec) >= 1;
                  const low = s.plan > 0 && s.fact < s.plan / 2;
                  const more = s.fact > s.plan;
                  return (
                    <div key={s.id} style={S.tile}>
                      <span style={{ ...S.edge, background: s.color }} />
                      <div className="ap-bud-tilehead" style={S.tileHead}>
                        <span style={S.tileName}>{s.name}</span>
                        <span style={off ? S.recOff : S.rec} title="Рекомендация: недельный ресурс, разделённый по остатку уроков">
                          рек. {hours(s.rec)}
                          {off ? (s.plan > s.rec ? " ↓" : " ↑") : ""}
                        </span>
                      </div>
                      <div style={S.tileCtl}>
                        <button type="button" onClick={() => onAlloc(s.id, Math.max(0, s.plan - ALLOC_STEP))} style={S.step} aria-label={"Меньше: " + s.name}>
                          −
                        </button>
                        <NumField value={s.plan} onCommit={(v) => onAlloc(s.id, v)} label={"Часов в неделю: " + s.name} className="ap-bud-num" style={S.planInput} />
                        <span style={S.unitBig}>ч</span>
                        <button type="button" onClick={() => onAlloc(s.id, s.plan + ALLOC_STEP)} style={S.step} aria-label={"Больше: " + s.name}>
                          +
                        </button>
                      </div>
                      <div style={S.factTrack}>
                        <div
                          className="ap-fill"
                          style={{ ...S.factFill, width: (s.plan > 0 ? Math.min(100, (s.fact / s.plan) * 100) : s.fact > 0 ? 100 : 0) + "%", background: more ? "var(--red)" : s.color }}
                        />
                      </div>
                      <span style={{ ...S.factText, ...(more || low ? S.factWarn : null) }}>
                        за 7 дней {hours(s.fact)}
                        {more ? " — больше плана" : low ? " — отстаёт" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Тёмная панель в обеих темах: переменные ночной палитры действуют
          внутри неё, поэтому и график КПВ рисуется светлым по тёмному. */}
      <aside className="ap-bud-out" data-theme="night" aria-labelledby="bud-out">
        <h2 id="bud-out" style={S.outTitle}>
          Что получается
        </h2>
        {checks.map((c) => (
          <div key={c.title} style={S.check}>
            <span style={{ ...S.mark, background: c.ok === null ? "var(--mute)" : c.ok ? "var(--green)" : "var(--red)" }} aria-hidden="true">
              {c.ok === null ? "?" : c.ok ? "✓" : "!"}
            </span>
            <div style={S.checkBody}>
              <span style={S.checkTitle}>{c.title}</span>
              <span style={S.checkText}>{c.text}</span>
              {c.go && (
                <button type="button" onClick={c.go} style={S.checkGo}>
                  К событиям →
                </button>
              )}
            </div>
          </div>
        ))}
        <div style={S.ppf}>
          <div style={S.ppfTitle}>КПВ · баланс предметов</div>
          <div style={S.ppfNote}>
            Точка — план и факт за 7 дней, кольцо — рекомендация, размер точки — сколько тем пройдено. Выше диагонали —
            предмет забирает больше плана, ниже — недобирает.
          </div>
          {balance.length ? <BalanceChart items={balance} labeled /> : <div style={S.ppfNote}>Появится, когда будут предметы.</div>}
        </div>
      </aside>
    </div>
  );
}

export const BUDGET_CSS = `
.ap-bud { display: grid; grid-template-columns: minmax(0, 1fr) 384px; gap: 16px 22px; align-items: start; }
.ap-bud-tiles { display: none; }
.ap-bud-in { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ap-bud-out {
  position: sticky; top: 16px; display: flex; flex-direction: column; gap: 14px; padding: 20px 22px;
  border-radius: var(--radius); background: #22201B; color: var(--ink); min-width: 0;
}
.ap-shell[data-theme="night"] .ap-bud-out { background: #0E0D0A; border: 1px solid #2C2A23; }
.ap-bud-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; align-items: end; }
.ap-bud-day {
  display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 2px; min-width: 0;
  border-radius: 12px; background: var(--neutralBg); border: 1px solid var(--line2);
}
.ap-bud-day.is-today { background: var(--warmBg); border-color: var(--warmLine); }
.ap-bud-daybar { height: 54px; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.ap-bud-dayh { font-size: 14.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ap-bud-dayctl { display: flex; gap: 4px; }
.ap-bud-dayname { font-size: 12.5px; color: var(--ink2); }
.ap-bud-dayedit { display: none; }
.ap-bud-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.ap-main input.ap-bud-num { border-color: transparent; background: transparent; box-shadow: none; }
.ap-main input.ap-bud-num:hover { border-color: var(--line); }
@media (max-width: 1180px) {
  .ap-bud { grid-template-columns: minmax(0, 1fr); }
  .ap-bud-out { position: static; }
}
`;

export const BUDGET_MOBILE_CSS = `
.ap-bud { gap: 12px; }
.ap-bud-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ap-bud-in { gap: 12px; }
.ap-main .ap-bud section.ap-card { padding: 12px 12px 14px !important; }
.ap-bud-days { gap: 4px; }
.ap-bud-day { padding: 6px 0 5px; gap: 1px; cursor: pointer; }
.ap-bud-day.is-on { border-color: var(--ink); }
.ap-bud-daybar { height: 34px; }
.ap-bud-dayh { font-size: 13px; }
.ap-bud-dayctl { display: none; }
.ap-bud-dayname { font-size: 11px; }
.ap-bud-dayedit { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line2); }
.ap-bud-cards { grid-template-columns: 1fr 1fr; gap: 8px; }
/* Узкая плитка: рекомендация под названием, иначе «Экономика» рвалась посреди слова. */
.ap-bud-tilehead { flex-direction: column; align-items: flex-start !important; gap: 4px !important; }
.ap-main input.ap-bud-num { width: 44px !important; font-size: 21px !important; }
.ap-bud-segname, .ap-bud-marklong { display: none; }
.ap-bud-out { padding: 14px 14px 10px; }
`;

const S = {
  card: { display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px 18px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)" },
  head: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  h2: { margin: 0, flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: 21, lineHeight: 1.3 },
  stepNo: {
    display: "inline-flex",
    width: 24,
    height: 24,
    marginRight: 8,
    borderRadius: "50%",
    background: "var(--btnBg)",
    color: "var(--btnInk)",
    fontFamily: "var(--sans)",
    fontSize: 13,
    fontWeight: 700,
    alignItems: "center",
    justifyContent: "center",
    verticalAlign: 3,
  },
  headNote: { fontSize: 13.5, color: "var(--ink2)" },
  badgeBad: { height: 24, padding: "0 10px", borderRadius: 12, background: "var(--redBg)", color: "var(--red)", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center" },
  badgeOk: { height: 24, padding: "0 10px", borderRadius: 12, background: "var(--greenSoft)", color: "var(--green)", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center" },
  muted: { margin: 0, fontSize: 14, color: "var(--ink3)" },
  step: { width: 32, height: 32, flexShrink: 0, padding: 0, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel2)", color: "var(--ink2)", fontSize: 16, lineHeight: 1 },
  stepSmall: { width: 24, height: 24, padding: 0, border: "1px solid var(--line)", borderRadius: 6, background: "var(--panel2)", color: "var(--ink2)", fontSize: 13, lineHeight: 1 },
  dayBar: { width: "50%", maxWidth: 40, minWidth: 14, borderRadius: "6px 6px 3px 3px" },
  dayToday: { fontWeight: 700, color: "var(--accent)" },
  dayEditName: { flex: 1, fontSize: 14.5, fontWeight: 600 },
  dayEditInput: { width: 64, height: 36, textAlign: "center", fontSize: 15, fontWeight: 600 },
  dayEditDone: { height: 36, padding: "0 12px", border: "none", borderRadius: 9, background: "var(--btnBg)", color: "var(--btnInk)", fontSize: 13.5, fontWeight: 600 },
  unit: { fontSize: 13, color: "var(--ink3)", marginLeft: -4 },
  unitBig: { fontFamily: "var(--serif)", fontSize: 20, marginLeft: -6 },
  weekWrap: { position: "relative", paddingTop: 20 },
  weekMark: { position: "absolute", top: 0, transform: "translateX(-50%)", fontSize: 12, fontWeight: 700, color: "var(--red)", whiteSpace: "nowrap" },
  week: { display: "flex", height: 40, gap: 2, borderRadius: 11, overflow: "hidden", background: "var(--line2)" },
  seg: { flexBasis: 0, flexShrink: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8px", color: "var(--accentInk)", lineHeight: 1.2, overflow: "hidden" },
  segName: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  segH: { fontSize: 11.5, opacity: 0.9, whiteSpace: "nowrap" },
  segFree: { flexBasis: 0, background: "repeating-linear-gradient(135deg, transparent 0 6px, var(--line) 6px 8px)" },
  hatch: {
    position: "absolute",
    top: 20,
    bottom: 0,
    right: 0,
    borderRadius: "0 11px 11px 0",
    background: "repeating-linear-gradient(135deg, rgba(164,69,44,0) 0 6px, rgba(164,69,44,.55) 6px 9px)",
    boxShadow: "inset 2px 0 0 var(--red)",
    pointerEvents: "none",
  },
  tile: { position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 7, padding: "11px 12px 11px 16px", borderRadius: 14, background: "var(--neutralBg)", border: "1px solid var(--line2)", minWidth: 0 },
  edge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  tileHead: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  tileName: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 },
  rec: { height: 22, padding: "0 8px", borderRadius: 11, fontSize: 11.5, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", background: "var(--panel)", color: "var(--ink2)" },
  recOff: { height: 22, padding: "0 8px", borderRadius: 11, fontSize: 11.5, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", background: "var(--warmBg)", color: "var(--warmInk)", fontWeight: 700 },
  tileCtl: { display: "flex", alignItems: "center", gap: 6 },
  planInput: { width: 58, height: 36, padding: "0 2px", textAlign: "right", fontFamily: "var(--serif)", fontSize: 24 },
  factTrack: { height: 5, borderRadius: 3, background: "var(--line)", overflow: "hidden" },
  factFill: { height: "100%" },
  factText: { fontSize: 12, color: "var(--ink3)", marginTop: -3 },
  factWarn: { color: "var(--red)", fontWeight: 600 },
  tileOk: { display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", borderRadius: 14, background: "var(--panel)", border: "1px solid var(--line)", minWidth: 0 },
  tileBad: { display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", borderRadius: 14, background: "var(--redBg)", border: "1px solid var(--redLine)", minWidth: 0 },
  tileLabel: { fontSize: 12, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tileBig: { fontFamily: "var(--serif)", fontSize: 21, lineHeight: 1.15 },
  tileOf: { fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink2)" },
  tileNote: { fontSize: 12, fontWeight: 700 },
  outTitle: { margin: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: 22 },
  check: { display: "flex", gap: 12, alignItems: "flex-start" },
  mark: { width: 26, height: 26, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#FBF8F1" },
  checkBody: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  checkTitle: { fontSize: 15, fontWeight: 600, lineHeight: 1.35 },
  checkText: { fontSize: 13, color: "var(--ink3)", lineHeight: 1.45 },
  checkGo: { alignSelf: "flex-start", border: "none", background: "none", padding: "4px 0 0", color: "var(--accent)", fontSize: 13, fontWeight: 600 },
  ppf: { borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 4 },
  ppfTitle: { fontFamily: "var(--serif)", fontSize: 18 },
  ppfNote: { fontSize: 12, color: "var(--mute)", lineHeight: 1.45, marginBottom: 4 },
};
