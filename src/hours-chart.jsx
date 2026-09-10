import React, { useMemo, useState } from "react";

// График потраченных часов. Один ряд данных — часы за период, поэтому легенда не нужна:
// подпись сверху называет ряд. У каждого столбца своя отметка цели (для дней цель разная
// по дням недели), она рисуется штрихом — различие по форме, а не по цвету.
const SCALES = [
  { value: "days", label: "Дни" },
  { value: "months", label: "Месяцы" },
  { value: "years", label: "Годы" },
];

const BAR = "#8C7326";
const TARGET = "#9B8B6A";
const AXIS = "#C9C1AC";
const INK = "#5A5347";
const MUTED = "#8A8370";

// Деления оси — «круглые» значения: 0,5 ч, 1 ч, 5 ч. Шаг подбирается так, чтобы
// делений было три-четыре, иначе подписи налезают друг на друга.
const NICE_STEPS = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000, 2500];

function niceScale(maxValue) {
  const target = 4;
  const step = NICE_STEPS.find((candidate) => candidate * target >= maxValue) || NICE_STEPS[NICE_STEPS.length - 1];
  const top = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function hoursWord(n) {
  const abs = Math.abs(Math.round(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "часов";
  if (last === 1) return "час";
  if (last >= 2 && last <= 4) return "часа";
  return "часов";
}

// Возвращает столбцы: часы по журналу и цель, сложенная из дневных целей периода.
function buildBuckets(journal, scale, goalForDate) {
  const byDate = {};
  journal.forEach((e) => {
    byDate[e.date] = (byDate[e.date] || 0) + (Number(e.hours) || 0);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (scale === "days") {
    const out = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = ymd(d);
      out.push({
        key,
        label: String(d.getDate()),
        showLabel: d.getDate() % 5 === 0,
        hours: byDate[key] || 0,
        goal: goalForDate(d),
        title: d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
        from: key,
        to: key,
      });
    }
    return out;
  }

  if (scale === "months") {
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const first = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      let hours = 0;
      let goal = 0;
      for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
        hours += byDate[ymd(d)] || 0;
        if (d <= today) goal += goalForDate(d);
      }
      out.push({
        key: first.getFullYear() + "-" + first.getMonth(),
        label: MONTHS_SHORT[first.getMonth()],
        showLabel: true,
        hours,
        goal,
        title: first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
        from: ymd(first),
        to: ymd(last),
      });
    }
    return out;
  }

  const years = journal.map((e) => Number(String(e.date).slice(0, 4))).filter(Boolean);
  const firstYear = years.length ? Math.min(...years) : today.getFullYear();
  const out = [];
  for (let y = firstYear; y <= today.getFullYear(); y++) {
    let hours = 0;
    let goal = 0;
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      hours += byDate[ymd(d)] || 0;
      if (d <= today) goal += goalForDate(d);
    }
    out.push({
      key: String(y),
      label: String(y),
      showLabel: true,
      hours,
      goal,
      title: y + " год",
      from: ymd(start),
      to: ymd(end),
    });
  }
  return out;
}

export default function HoursChart({ journal, homework, subjects, goalForDate }) {
  const [scale, setScale] = useState("days");
  const [active, setActive] = useState(null);

  const buckets = useMemo(() => buildBuckets(journal, scale, goalForDate), [journal, scale, goalForDate]);

  const periodFrom = buckets.length ? buckets[0].from : null;
  const periodTo = buckets.length ? buckets[buckets.length - 1].to : null;

  const inPeriod = useMemo(
    () => journal.filter((e) => periodFrom && e.date >= periodFrom && e.date <= periodTo),
    [journal, periodFrom, periodTo]
  );

  const periodHours = round1(inPeriod.reduce((sum, e) => sum + (Number(e.hours) || 0), 0));
  const totalHours = round1(journal.reduce((sum, e) => sum + (Number(e.hours) || 0), 0));

  const bestSubject = useMemo(() => {
    const map = {};
    inPeriod.forEach((e) => {
      map[e.subjectId] = (map[e.subjectId] || 0) + (Number(e.hours) || 0);
    });
    let best = null;
    Object.keys(map).forEach((id) => {
      if (!best || map[id] > best.hours) best = { id, hours: map[id] };
    });
    if (!best) return null;
    const subject = subjects.find((s) => s.id === best.id);
    return { name: subject ? subject.name : "Другое", color: subject ? subject.color : MUTED, hours: round1(best.hours) };
  }, [inPeriod, subjects]);

  const homeworkStats = useMemo(() => {
    const inRange = homework.filter((h) => periodFrom && h.date >= periodFrom && h.date <= periodTo);
    return { done: inRange.filter((h) => h.done).length, total: inRange.length };
  }, [homework, periodFrom, periodTo]);

  // Ось строится по фактическим часам: цель за год в сотни часов иначе прижимает
  // реальные столбцы к нулю. Отметка цели рисуется, только если попадает в шкалу,
  // а точное её значение всегда видно в подписи под графиком.
  const maxHours = Math.max(0, ...buckets.map((b) => b.hours));
  const scaleInfo = niceScale(Math.max(0.5, maxHours));
  const maxValue = scaleInfo.top;
  const maxIndex = buckets.reduce((best, b, i) => (b.hours > buckets[best].hours ? i : best), 0);

  // Система координат подписей и штрихов — одна на всех: сетка, отметки, столбцы.
  const W = 320;
  const H = 190;
  const left = 30;
  const right = 8;
  const top = 12;
  const bottom = 22;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const step = plotW / buckets.length;
  // При одном-двух столбцах полоса во всю ширину читается как заливка, а не как данные.
  const barW = Math.min(44, Math.max(3, step - 2));
  const yOf = (value) => top + plotH - (value / maxValue) * plotH;

  const ticks = scaleInfo.ticks;
  const activeBucket = active === null ? null : buckets[active];

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <div style={styles.title}>Часы занятий по дневнику</div>
        <div style={styles.scaleRow}>
          {SCALES.map((s) => {
            const on = s.value === scale;
            return (
              <button
                key={s.value}
                onClick={() => {
                  setScale(s.value);
                  setActive(null);
                }}
                style={{
                  ...styles.scaleBtn,
                  color: on ? "#fff" : INK,
                  background: on ? "#2B2822" : "#fff",
                  borderColor: on ? "#2B2822" : AXIS,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {totalHours === 0 ? (
        <p style={styles.empty}>
          Пока нечего рисовать: часы появятся здесь сами, когда вы отметите урок пройденным или добавите заметку с
          затраченным временем.
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={styles.svg} role="img" aria-label="Часы занятий по периодам">
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={left} y1={yOf(t)} x2={W - right} y2={yOf(t)} stroke={AXIS} strokeWidth="0.5" />
                <text x={left - 4} y={yOf(t) + 3} textAnchor="end" fontSize="8" fill={MUTED}>
                  {t >= 10 ? Math.round(t) : round1(t)}
                </text>
              </g>
            ))}

            {buckets.map((b, i) => {
              const x = left + i * step + (step - barW) / 2;
              const y = yOf(b.hours);
              const h = top + plotH - y;
              const r = Math.min(3, barW / 2);
              const isActive = active === i;
              return (
                <g key={b.key}>
                  {h > 0 && (
                    <path
                      d={`M${x},${top + plotH} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${
                        x + barW
                      },${y} ${x + barW},${y + r} L${x + barW},${top + plotH} Z`}
                      fill={BAR}
                      opacity={active === null || isActive ? 1 : 0.45}
                    />
                  )}
                  {b.goal > 0 && b.goal <= maxValue && (
                    <line
                      x1={x - 1}
                      y1={yOf(b.goal)}
                      x2={x + barW + 1}
                      y2={yOf(b.goal)}
                      stroke={TARGET}
                      strokeWidth="1.2"
                      strokeDasharray="2 1.5"
                    />
                  )}
                  <rect
                    x={left + i * step}
                    y={top}
                    width={step}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onClick={() => setActive(isActive ? null : i)}
                  />
                </g>
              );
            })}

            {buckets[maxIndex] && buckets[maxIndex].hours > 0 && active === null && (
              <text
                x={left + maxIndex * step + step / 2}
                y={yOf(buckets[maxIndex].hours) - 4}
                textAnchor="middle"
                fontSize="8"
                fill={INK}
              >
                {round1(buckets[maxIndex].hours)} ч
              </text>
            )}

            <line x1={left} y1={top + plotH} x2={W - right} y2={top + plotH} stroke={AXIS} strokeWidth="1" />

            {buckets.map((b, i) =>
              b.showLabel ? (
                <text
                  key={b.key}
                  x={left + i * step + step / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="8"
                  fill={MUTED}
                >
                  {b.label}
                </text>
              ) : null
            )}
          </svg>

          <div style={styles.readout}>
            {activeBucket ? (
              <>
                <b>{activeBucket.title}</b> — {round1(activeBucket.hours)} {hoursWord(activeBucket.hours)}
                {activeBucket.goal > 0 && <span style={styles.muted}> · цель {round1(activeBucket.goal)} ч</span>}
              </>
            ) : (
              <span style={styles.muted}>
                Наведите или нажмите на столбец, чтобы увидеть точные часы. Штрих — цель на этот период.
              </span>
            )}
          </div>

          <div style={styles.stats}>
            <div style={styles.stat}>
              <div style={styles.statValue}>{periodHours} ч</div>
              <div style={styles.statLabel}>за выбранный период</div>
              <div style={styles.statSub}>всего {totalHours} ч</div>
            </div>
            <div style={styles.stat}>
              <div style={{ ...styles.statValue, display: "flex", alignItems: "center", gap: 6 }}>
                {bestSubject ? (
                  <>
                    <span style={{ ...styles.dot, background: bestSubject.color }} />
                    <span style={styles.statSubject}>{bestSubject.name}</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div style={styles.statLabel}>больше всего часов</div>
              <div style={styles.statSub}>{bestSubject ? bestSubject.hours + " ч" : "записей нет"}</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statValue}>
                {homeworkStats.done}
                <span style={styles.statOf}>/{homeworkStats.total}</span>
              </div>
              <div style={styles.statLabel}>выполнено дел</div>
              <div style={styles.statSub}>заданий за период</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  wrap: { background: "#F7F4EC", border: "1px solid #DCD5C4", borderRadius: 6, padding: 14, marginTop: 10 },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  title: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 15, color: "#2B2822" },
  scaleRow: { display: "flex", gap: 4 },
  scaleBtn: { border: "1px solid", borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 600 },
  svg: { width: "100%", height: "auto", display: "block", marginTop: 8, touchAction: "manipulation" },
  empty: { fontSize: 13, color: "#6B6656", lineHeight: 1.55, margin: "10px 0 0" },
  readout: { fontSize: 12.5, color: "#2B2822", minHeight: 32, lineHeight: 1.45, marginTop: 2 },
  muted: { color: "#8A8370" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginTop: 10 },
  stat: { borderTop: "2px solid #DCD5C4", paddingTop: 8 },
  statValue: {
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 20,
    color: "#2B2822",
    lineHeight: 1.1,
    fontVariantNumeric: "tabular-nums",
  },
  statSubject: { fontSize: 15 },
  statOf: { fontSize: 13, color: "#8A8370" },
  statLabel: { fontSize: 11.5, color: "#6B6656", marginTop: 3 },
  statSub: { fontSize: 11, color: "#8A8370", marginTop: 1 },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0, display: "inline-block" },
};
