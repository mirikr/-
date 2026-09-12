import React, { useState } from "react";

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
//
// Наведение на точку открывает разбор по предмету: на самом графике читается
// направление перекоса, но не его причина.
const W = 460;
const H = 360;
const X0 = 48;
const X1 = 442;
const Y0 = 310;
const Y1 = 22;

export default function BalanceChart({ items }) {
  const [active, setActive] = useState(null);
  const max = Math.max(2, ...items.map((s) => Math.max(s.plan, s.fact, s.recommended || 0))) * 1.1;
  const px = (v) => X0 + (Math.min(v, max) / max) * (X1 - X0);
  const py = (v) => Y0 - (Math.min(v, max) / max) * (Y0 - Y1);
  const current = items.find((s) => s.id === active) || null;

  return (
    <div style={styles.wrap}>
      <div style={styles.plot} onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} style={styles.svg} role="img" aria-label="План и факт по предметам">
          <line x1={X0} y1={Y0} x2={X1} y2={Y0} stroke="var(--line)" strokeWidth="1" />
          <line x1={X0} y1={Y0} x2={X0} y2={Y1} stroke="var(--line)" strokeWidth="1" />
          <line x1={X0} y1={Y0} x2={px(max)} y2={py(max)} stroke="var(--ink3)" strokeWidth="1.5" strokeDasharray="5 4" />
          {/* Подпись слева вверху: у диагонали она наезжала на саму линию. */}
          <text x={X0 + 8} y={Y1 + 8} fontSize="11" fill="var(--ink3)">
            диагональ — баланс, кольцо — рекомендация
          </text>
          <text x={X0} y={Y0 + 20} fontSize="11" fill="var(--mute)">
            0
          </text>
          <text x={X1} y={Y0 + 20} fontSize="11" fill="var(--mute)" textAnchor="end">
            план, ч/нед → {Math.round(max)}
          </text>
          <text x={4} y={Y1 + 4} fontSize="11" fill="var(--mute)">
            факт, ч
          </text>

          {items.map((s, i) => {
            const x = px(s.plan);
            const y = py(s.fact);
            const rec = px(s.recommended || 0);
            const recY = py(s.recommended || 0);
            const r = 6 + Math.min(s.done, 12) * 1.1;
            const on = s.id === active;
            return (
              <g key={s.id}>
                {/* Пунктир от точки к рекомендации на диагонали: и есть тот разрыв,
                    который надо закрыть — по плану вправо-влево, по факту вверх-вниз. */}
                <line x1={x} y1={y} x2={rec} y2={recY} stroke={s.color} strokeWidth="1" strokeDasharray="2 2" opacity={on ? 0.9 : 0.5} />
                <circle cx={rec} cy={recY} r="6.5" fill="none" stroke={s.color} strokeWidth="1.8" opacity="0.85" />
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={s.color}
                  stroke={on ? "var(--ink)" : "var(--panel)"}
                  strokeWidth={on ? 2.5 : 1.5}
                  className="ap-bar-svg"
                  tabIndex={0}
                  role="button"
                  aria-label={s.name}
                  style={{ animationDelay: (0.05 + i * 0.06).toFixed(2) + "s", cursor: "pointer", outline: "none" }}
                  onMouseEnter={() => setActive(s.id)}
                  // Уход с точки должен закрывать разбор. Одного onMouseLeave на
                  // всём графике мало: увёл курсор на пустое поле рядом — и окно
                  // висело, пока не выйдешь за рамку графика целиком.
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(s.id)}
                  onBlur={() => setActive(null)}
                  // На телефоне навести нечем, поэтому касание работает как наведение.
                  onClick={() => setActive(on ? null : s.id)}
                />
              </g>
            );
          })}
        </svg>

        {current && <Explain item={current} x={px(current.plan)} y={py(current.fact)} onClose={() => setActive(null)} />}
      </div>

      <div style={styles.legend}>
        {items.map((s) => (
          <button
            key={s.id}
            style={{ ...styles.legendRow, ...(s.id === active ? styles.legendRowOn : null) }}
            onMouseEnter={() => setActive(s.id)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(s.id === active ? null : s.id)}
          >
            <span style={{ ...styles.dot, background: s.color }} />
            <span style={styles.name}>{s.name}</span>
            <span style={styles.tail}>
              {String(s.fact).replace(".", ",")} / {s.plan} ч
              <span style={styles.rec}> · рек. {String(s.recommended || 0).replace(".", ",")}</span>
            </span>
            <span style={{ ...styles.drift, color: driftColor(s.fact - s.plan) }}>{driftLabel(s.fact - s.plan)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Разбор по предмету. Держится рядом с точкой, но не вылезает за график: у
// правого края разворачивается влево, у верхнего — вниз. На узком экране
// накладка закрывала бы весь график, поэтому там она уходит под него —
// см. .ap-balance-tip в theme.js.
function Explain({ item, x, y, onClose }) {
  const right = x > W * 0.55;
  const low = y < H * 0.4;
  const style = {
    ...styles.tip,
    left: right ? undefined : (x / W) * 100 + "%",
    right: right ? ((W - x) / W) * 100 + "%" : undefined,
    top: low ? (y / H) * 100 + "%" : undefined,
    bottom: low ? undefined : ((H - y) / H) * 100 + "%",
    marginLeft: right ? 0 : 14,
    marginRight: right ? 14 : 0,
    marginTop: low ? 10 : 0,
    marginBottom: low ? 0 : 10,
  };
  const gapPlan = Math.round(((item.recommended || 0) - item.plan) * 10) / 10;
  return (
    <div className="ap-balance-tip" style={style} onClick={onClose}>
      <div style={{ ...styles.tipName, color: item.color }}>{item.name}</div>
      <div style={styles.tipRow}>
        План <b>{String(item.plan).replace(".", ",")} ч</b> в неделю
      </div>
      <div style={styles.tipRow}>
        Записано за 7 дней <b>{String(item.fact).replace(".", ",")} ч</b>
      </div>
      <div style={styles.tipRow}>
        Рекомендация <b>{String(item.recommended || 0).replace(".", ",")} ч</b>
        {gapPlan !== 0 && (
          <span style={styles.tipMuted}>
            {" "}
            — это на {String(Math.abs(gapPlan)).replace(".", ",")} ч {gapPlan > 0 ? "больше" : "меньше"} плана
          </span>
        )}
      </div>
      <div style={styles.tipVerdict}>{verdict(item)}</div>
      <div style={styles.tipMuted}>Пройдено тем: {item.done} — от этого размер точки.</div>
    </div>
  );
}

function verdict(item) {
  const drift = item.fact - item.plan;
  if (item.fact === 0) return "За неделю по предмету ничего не записано — точка лежит на нижней границе.";
  if (drift > 0.5) return "Точка выше диагонали: предмет забирает больше времени, чем ему отведено планом.";
  if (drift < -0.5) return "Точка ниже диагонали: предмет недобирает — за неделю вышло меньше плана.";
  return "Точка на диагонали: план и факт сошлись.";
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
  plot: { position: "relative", flex: "1 1 min(460px, 100%)", minWidth: 0, maxWidth: 560 },
  svg: { display: "block", width: "100%", background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10 },
  legend: { flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    width: "100%",
    // Рамка и фон заданы по отдельным свойствам, а не сокращением `border`:
    // подсветка меняет только цвет, и React, снимая её, возвращал сокращение
    // целиком — у кнопки проступала белая рамка по умолчанию, которая так и
    // оставалась на каждой строке, где побывал курсор.
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    background: "transparent",
    borderRadius: 8,
    padding: "3px 6px",
    textAlign: "left",
    color: "inherit",
  },
  legendRowOn: { borderColor: "var(--line)", background: "var(--panel2)" },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  name: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tail: { color: "var(--ink3)", whiteSpace: "nowrap" },
  rec: { color: "var(--mute)" },
  drift: { fontWeight: 600, minWidth: 56, textAlign: "right" },
  tip: {
    position: "absolute",
    zIndex: 3,
    width: "min(216px, 84%)",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "9px 11px",
    boxShadow: "0 6px 18px rgba(0,0,0,.16)",
    fontSize: 12,
    lineHeight: 1.5,
    pointerEvents: "none",
  },
  tipName: { fontWeight: 700, fontSize: 13, marginBottom: 4 },
  tipRow: { color: "var(--ink2)" },
  tipVerdict: { marginTop: 5, color: "var(--ink)" },
  tipMuted: { color: "var(--mute)", fontSize: 11.5, marginTop: 4 },
};
