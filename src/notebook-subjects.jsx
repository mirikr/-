import React, { useRef, useState } from "react";
import { dropIndex } from "./notebook-order.js";

// Список предметов в «Тетрадях». Карандаш в заголовке включает правку:
// у каждой строки появляются булавка и ручка. Тянуть можно мышью за всю
// строку, пальцем — за ручку, чтобы по остальной строке список по-прежнему
// прокручивался. Стрелки ↑/↓ на ручке делают то же с клавиатуры.
// startEditing и onDone — для телефона: там колонки предметов нет, список
// открывается сразу в правке по карандашу у чипов, а «Готово» его закрывает.
export default function NotebookSubjects({ owners, current, countOf, onPick, onPin, onMove, startEditing, onDone }) {
  const [editing, setEditing] = useState(!!startEditing);
  const [drag, setDrag] = useState(null); // { from, over, mids }
  const rows = useRef([]);
  const pinnedCount = owners.filter((o) => o.pinned).length;

  function startDrag(e, index) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest && e.target.closest("[data-nodrag]")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    // Середины строк — в координатах страницы: при автопрокрутке они не сбиваются.
    const mids = owners.map((_, i) => {
      const el = rows.current[i];
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.top + window.scrollY + r.height / 2;
    });
    setDrag({ from: index, over: index, mids });
  }

  function moveDrag(e) {
    if (!drag) return;
    // У края экрана список подъезжает сам — длинный список на телефоне иначе
    // не перетащить с конца в начало.
    if (e.clientY < 60) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
    const over = dropIndex(drag.mids, drag.from, e.clientY + window.scrollY, pinnedCount);
    if (over !== drag.over) setDrag({ ...drag, over });
  }

  function endDrag() {
    if (!drag) return;
    if (drag.over !== drag.from) onMove(drag.from, drag.over);
    setDrag(null);
  }

  function onKey(e, index) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onMove(index, index + (e.key === "ArrowUp" ? -1 : 1));
    }
  }

  // Пока тянут — показываем список уже с предметом на новом месте.
  const shown = owners.map((o, i) => ({ o, i }));
  if (drag && drag.over !== drag.from) {
    const [moved] = shown.splice(drag.from, 1);
    shown.splice(drag.over, 0, moved);
  }

  return (
    <>
      <div style={S.head}>
        <span style={S.headTitle}>Предметы</span>
        <button
          type="button"
          onClick={() => {
            setDrag(null);
            if (editing && onDone) {
              onDone();
              return;
            }
            setEditing((v) => !v);
          }}
          className="ap-row"
          style={{ ...S.iconBtn, ...(editing ? S.iconBtnOn : null) }}
          aria-pressed={editing}
          aria-label={editing ? "Готово" : "Изменить порядок предметов"}
          title={editing ? "Готово" : "Закрепить и расставить предметы"}
        >
          {editing ? <CheckIcon /> : <PencilIcon />}
        </button>
      </div>
      {editing && (
        <div style={S.hint}>Булавка поднимает предмет наверх. Порядок — перетаскиванием за ⋮⋮.</div>
      )}
      {/* В обычном режиме предметы — группами: закреплённые, свои, лицейские.
          Порядок внутри групп тот же, что задан карандашом. */}
      {!editing && (
        <div style={S.groups}>
          {[
            ["Закреплённые", owners.filter((o) => o.pinned)],
            ["Свои предметы", owners.filter((o) => !o.pinned && o.from !== "lyceum")],
            ["Лицей КЭО", owners.filter((o) => !o.pinned && o.from === "lyceum")],
          ].filter(([, list]) => list.length).map(([label, list], gi) =>
            list.length ? (
              <div key={label} style={S.group}>
                {/* Первая группа «своих» идёт сразу под заголовком «Предметы» — вторая подпись там лишняя. */}
                {!(gi === 0 && label === "Свои предметы") && <div style={S.groupLabel}>{label}</div>}
                {list.map((o) => {
                  const on = o.key === current;
                  const count = countOf(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => onPick(o.key)}
                      aria-current={on ? "true" : undefined}
                      className="ap-notes-subject"
                      style={{ ...S.row, ...(on ? S.rowOn : null) }}
                    >
                      <span style={{ ...S.dot, background: o.color }} />
                      <span style={S.name}>{o.name}</span>
                      <span style={S.count}>{count || ""}</span>
                    </button>
                  );
                })}
              </div>
            ) : null
          )}
        </div>
      )}
      {editing && (
      <div style={S.list} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {shown.map(({ o, i }) => {
          const on = o.key === current;
          const count = countOf(o.key);
          const dragging = drag && drag.from === i;
          const body = (
            <>
              <span style={{ ...S.dot, background: o.color }} />
              <span style={S.name}>{o.name}</span>
              {!editing && o.pinned && (
                <span style={S.pinMark} title="Закреплён" aria-label="закреплён">
                  <PinIcon filled />
                </span>
              )}
              {!editing && <span style={S.count}>{count ? count + " блок." : "пусто"}</span>}
            </>
          );
          if (!editing) {
            return (
              <button
                key={o.key}
                onClick={() => onPick(o.key)}
                style={{
                  ...S.pick,
                  background: on ? "var(--neutralBg)" : "transparent",
                  borderColor: on ? "var(--mute)" : "var(--line2)",
                }}
              >
                {body}
              </button>
            );
          }
          return (
            <div
              key={o.key}
              ref={(el) => (rows.current[i] = el)}
              data-subject={o.name}
              onPointerDown={(e) => e.pointerType === "mouse" && startDrag(e, i)}
              style={{
                ...S.pick,
                ...S.editRow,
                borderColor: dragging ? "var(--mute)" : "var(--line2)",
                background: dragging ? "var(--neutralBg)" : "transparent",
                boxShadow: dragging ? "0 6px 18px rgba(0,0,0,.12)" : "none",
              }}
            >
              <span
                role="button"
                tabIndex={0}
                aria-label={"Перетащить: " + o.name}
                title="Перетащить"
                onPointerDown={(e) => e.pointerType !== "mouse" && startDrag(e, i)}
                onKeyDown={(e) => onKey(e, i)}
                style={S.handle}
              >
                ⋮⋮
              </span>
              {body}
              <button
                type="button"
                data-nodrag
                onClick={() => onPin(o.key)}
                className="ap-row"
                style={{ ...S.iconBtn, ...(o.pinned ? S.iconBtnOn : null) }}
                aria-pressed={o.pinned}
                aria-label={(o.pinned ? "Открепить: " : "Закрепить: ") + o.name}
                title={o.pinned ? "Открепить" : "Закрепить наверху"}
              >
                <PinIcon filled={o.pinned} />
              </button>
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function PinIcon({ filled }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h6l-1 6 4 4H6l4-4-1-6z" />
      <path d="M12 13v8" />
    </svg>
  );
}

const S = {
  head: { display: "flex", alignItems: "center", gap: 8, padding: "0 8px 10px" },
  headTitle: { flex: 1, fontSize: 12, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--mute)" },
  groups: { display: "flex", flexDirection: "column", gap: 14 },
  group: { display: "flex", flexDirection: "column", gap: 2 },
  groupLabel: { padding: "0 10px 4px", fontSize: 11.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--mute)" },
  row: { display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 40, padding: "0 10px", border: "none", borderRadius: 10, background: "transparent", color: "var(--ink)", fontSize: 14, textAlign: "left", cursor: "pointer" },
  rowOn: { background: "var(--panel2)", fontWeight: 600, boxShadow: "0 1px 2px rgba(34,32,27,.08)" },
  list: { display: "flex", flexDirection: "column", gap: 4 },
  pick: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 9px",
    border: "1px solid",
    borderRadius: 10,
    fontSize: 13.5,
    textAlign: "left",
  },
  editRow: { cursor: "grab", userSelect: "none", WebkitUserSelect: "none", padding: "4px 6px 4px 2px" },
  handle: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    color: "var(--mute)",
    fontSize: 14,
    letterSpacing: -3,
    cursor: "grab",
    touchAction: "none",
    borderRadius: 8,
  },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  name: { flex: 1, minWidth: 0 },
  count: { fontSize: 12, color: "var(--mute)" },
  pinMark: { display: "inline-flex", color: "var(--ink3)" },
  hint: { fontSize: 12, color: "var(--ink3)", margin: "-2px 0 8px", lineHeight: 1.45 },
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    padding: 0,
    flexShrink: 0,
    border: "1px solid var(--line)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--ink3)",
    cursor: "pointer",
  },
  iconBtnOn: { background: "var(--neutralBg)", color: "var(--ink)", borderColor: "var(--mute)" },
};
