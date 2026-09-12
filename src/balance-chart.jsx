import React from "react";

// Баланс предметов: план против факта сразу по всем предметам.
//
// Раньше здесь сравнивались два предмета на выбор — приходилось перебирать пары,
// чтобы понять, где перекос. Тут всё видно сразу: по горизонтали — сколько часов
// в неделю вы себе запланировали, по вертикали — сколько записано в дневнике за
// последние семь дней. Диагональ — линия баланса: точка на ней означает, что
// план и факт сошлись. Выше линии — предмет забирает больше времени, чем ему
// отведено, ниже — недобирает. Размер точки — сколько тем по предмету пройдено.
//
// Кольцо на диагонали — рекомендация: недельный ресурс, разделённый по остатку
// работы. Пунктир от точки к кольцу показывает, сколько осталось до неё пройти —
// и по плану, и по факту сразу.
const W = 320;
const H = 268;
const X0 = 40;
const X1 = 306;
const Y0 = 226;
const Y1 = 16;

export default function BalanceChart({ items }) {
  const max = Math.max(2, ...items.map((s) => Math.max(s.plan, s.fact, s.recommended || 0))) * 1.1;
  const px = (v) => X0 + (Math.min(v, max) / max) * (X1 - X0);
  const py = (v) => Y0 - (Math.min(v, max) / max) * (Y0 - Y1);

  return (
    <div style={styles.wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} style={styles.svg} role="img" aria-label="План и факт по предметам">
        <line x1={X0} y1={Y0} x2={X1} y2={Y0} stroke="var(--line)" strokeWidth="1" />
        <line x1={X0} y1={Y0} x2={X0} y2={Y1} stroke="var(--line)" strokeWidth="1" />
        <line x1={X0} y1={Y0} x2={px(max)} y2={py(max)} stroke="var(--ink3)" strokeWidth="1.5" strokeDasharray="5 4" />
        {/* Подпись слева вверху: у диагонали она наезжала на саму линию. */}
        <text x={X0 + 6} y={Y1 + 6} fontSize="9.5" fill="var(--ink3)">
          диагональ — баланс, кольцо — рекомендация
        </text>
        <text x={X0} y={Y0 + 18} fontSize="9.5" fill="var(--mute)">
          0
        </text>
        <text x={X1} y={Y0 + 18} fontSize="9.5" fill="var(--mute)" textAnchor="end">
          план, ч/нед → {Math.round(max)}
        </text>
        <text x={4} y={Y1 + 4} fontSize="9.5" fill="var(--mute)">
          факт, ч
        </text>

        {items.map((s, i) => {
          const x = px(s.plan);
          const y = py(s.fact);
          const rec = px(s.recommended || 0);
          const recY = py(s.recommended || 0);
          const r = 5 + Math.min(s.done, 12) * 0.9;
          return (
            <g key={s.id}>
              {/* Пунктир от точки к рекомендации на диагонали: и есть тот разрыв,
                  который надо закрыть — по плану вправо-влево, по факту вверх-вниз. */}
              <line x1={x} y1={y} x2={rec} y2={recY} stroke={s.color} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
              <circle cx={rec} cy={recY} r="5.5" fill="none" stroke={s.color} strokeWidth="1.8" opacity="0.85" />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={s.color}
                stroke="var(--panel)"
                strokeWidth="1.5"
                className="ap-bar-svg"
                style={{ animationDelay: (0.05 + i * 0.06).toFixed(2) + "s" }}
              >
                <title>
                  {s.name}: план {s.plan} ч/нед, факт {s.fact} ч
                </title>
              </circle>
            </g>
          );
        })}
      </svg>

      <div style={styles.legend}>
        {items.map((s) => (
          <div key={s.id} style={styles.legendRow}>
            <span style={{ ...styles.dot, background: s.color }} />
            <span style={styles.name}>{s.name}</span>
            <span style={styles.tail}>
              {String(s.fact).replace(".", ",")} / {s.plan} ч
              <span style={styles.rec}> · рек. {String(s.recommended || 0).replace(".", ",")}</span>
            </span>
            <span style={{ ...styles.drift, color: driftColor(s.fact - s.plan) }}>{driftLabel(s.fact - s.plan)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function driftLabel(drift) {
  const rounded = Math.round(drift * 10) / 10;
  if (Math.abs(rounded) < 0.5) return "в балансе";
  return (rounded > 0 ? "+" : "") + String(rounded).replace(".", ",") + " ч";
}

function driftColor(drift) {
  if (drift > 0.5) return "var(--red)";
  if (drift < -0.5) return "var(--gold)";
  return "var(--ink3)";
}

const styles = {
  wrap: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" },
  svg: { flex: "1 1 300px", maxWidth: 360, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10 },
  legend: { flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  legendRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  name: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tail: { color: "var(--ink3)", whiteSpace: "nowrap" },
  rec: { color: "var(--mute)" },
  drift: { fontWeight: 600, minWidth: 56, textAlign: "right" },
};
