import React, { useState } from "react";
import { LEVELS, SORTS } from "./notebook-order.js";
import SortableList from "./sortable-list.jsx";
import { dropFileTo, useFileDropTarget } from "./file-drag.js";

// Список предметов в «Тетрадях». Карандаш в заголовке включает правку:
// у каждой строки появляются булавка и ручка; перетаскивание — SortableList
// (предмет берётся целиком и едет за мышью или пальцем).
// startEditing и onDone — для телефона: там колонки предметов нет, список
// открывается сразу в правке по карандашу у чипов, а «Готово» его закрывает.
export default function NotebookSubjects({ owners, current, countOf, onPick, onPin, onMove, startEditing, onDone, sort, onSort }) {
  const [editing, setEditing] = useState(!!startEditing);
  return (
    <>
      <div style={S.head}>
        <span style={S.headTitle}>Предметы</span>
        <button
          type="button"
          onClick={() => {
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
      {onSort && (
        <label style={S.sortRow}>
          <span style={S.sortLabel}>Порядок</span>
          <select value={sort || "manual"} onChange={(e) => onSort(e.target.value)} style={S.sortSelect} aria-label="Порядок предметов">
            {SORTS.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </label>
      )}
      {editing && (
        <div style={S.hint}>
          Булавка поднимает предмет наверх. Порядок — перетаскиванием за ⋮⋮
          {sort && sort !== "manual" ? "; перетащили — порядок станет ручным." : "."}
        </div>
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
                    <SubjectDrop key={o.key} ownerKey={o.key} onOpen={() => onPick(o.key)} render={(dp) => (
                    <button
                      {...dp}
                      type="button"
                      onClick={() => onPick(o.key)}
                      aria-current={on ? "true" : undefined}
                      className="ap-notes-subject"
                      style={{ "--c": o.color, ...S.row, ...(on ? S.rowOn : null) }}
                    >
                      <span style={{ ...S.dot, background: o.color }} />
                      <span style={S.name}>{o.name}</span>
                      <Badges owner={o} />
                      <span style={S.count}>{count || ""}</span>
                    </button>
                    )} />
                  );
                })}
              </div>
            ) : null
          )}
        </div>
      )}
      {editing && (
        <SortableList
          items={owners}
          keyOf={(o) => o.key}
          labelOf={(o) => o.name}
          groupOf={(o) => (o.pinned ? 0 : 1)}
          onMove={onMove}
          renderItem={(o, { handleProps, dragging }) => (
            <div
              data-subject={o.name}
              style={{ ...S.pick, ...S.editRow, borderColor: dragging ? "var(--mute)" : "var(--line2)" }}
            >
              <span {...handleProps}>⋮⋮</span>
              <span style={{ ...S.dot, background: o.color }} />
              <span style={S.name}>{o.name}</span>
              <Badges owner={o} />
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
          )}
        />
      )}
    </>
  );
}

// Файл, перетаскиваемый мышью: подержали над предметом — открылась его
// тетрадь; бросили прямо на предмет — файл ляжет в блок «Файлы».
function SubjectDrop({ ownerKey, onOpen, render }) {
  const [props] = useFileDropTarget({ onDrop: () => dropFileTo({ ownerKey, inbox: true }), onSpring: onOpen });
  return render(props);
}

// Сбоку от названия: важность столбиками и уровень по расписанию.
const PRIORITY_WORD = { 1: "обычный", 2: "важный", 3: "очень важный" };
export function Badges({ owner, compact, onDark }) {
  const level = LEVELS[owner.level];
  const p = Number(owner.priority) || 0;
  if (!level && !p) return null;
  return (
    <span style={{ ...S.badges, ...(compact ? S.badgesCompact : null) }} data-badges>
      {p > 0 && (
        <span style={S.bars} title={"Важность: " + PRIORITY_WORD[p]} aria-label={"важность: " + PRIORITY_WORD[p]} data-priority={p}>
          {[1, 2, 3].map((i) => (
            <span key={i} style={{ ...S.bar, height: 4 + i * 3, background: i <= p ? (p === 3 ? "var(--red)" : p === 2 ? "var(--gold, #B98A2E)" : onDark ? "currentColor" : "var(--ink3)") : onDark ? "rgba(127,127,127,.45)" : "var(--line)" }} />
          ))}
        </span>
      )}
      {level && (
        <span
          style={{ ...S.level, ...(owner.level === "special" ? S.levelSpecial : owner.level === "prof" ? S.levelProf : null), ...(onDark ? S.levelOnDark : null) }}
          data-level={owner.level}
        >
          {level.label}
        </span>
      )}
    </span>
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
  // Фон под курсором и у открытого — в CSS (.ap-notes-subject в study-planner).
  row: { display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 40, padding: "0 10px", border: "none", borderRadius: 10, color: "var(--ink)", fontSize: 14, textAlign: "left", cursor: "pointer" },
  rowOn: { fontWeight: 600 },
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
  // Длинное название переносится по словам, а метки остаются сбоку; слово,
  // которое само не влезает, рвётся, а не наезжает на метки.
  name: { flex: 1, minWidth: 0, overflowWrap: "anywhere", lineHeight: 1.25, padding: "5px 0" },
  count: { fontSize: 12, color: "var(--mute)" },
  pinMark: { display: "inline-flex", color: "var(--ink3)" },
  hint: { fontSize: 12, color: "var(--ink3)", margin: "-2px 0 8px", lineHeight: 1.45 },
  sortRow: { display: "flex", alignItems: "center", gap: 8, padding: "0 8px 10px" },
  sortLabel: { fontSize: 12, color: "var(--mute)" },
  sortSelect: {
    flex: 1, minWidth: 0, border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", font: "inherit", fontSize: 12.5,
    background: "var(--panel2)", color: "var(--ink)",
  },
  badges: { display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 },
  badgesCompact: { gap: 5, marginLeft: 1 },
  bars: { display: "inline-flex", alignItems: "flex-end", gap: 1.5, height: 13 },
  bar: { width: 3, borderRadius: 1 },
  level: {
    fontSize: 10.5, fontWeight: 600, letterSpacing: "0.02em", padding: "1px 6px", borderRadius: 999,
    border: "1px solid var(--line)", color: "var(--ink3)", whiteSpace: "nowrap",
  },
  levelProf: { borderColor: "var(--ink3)", color: "var(--ink2)" },
  levelOnDark: { background: "transparent", borderColor: "currentColor", color: "inherit", opacity: 0.8 },
  levelSpecial: { borderColor: "var(--warmLine)", background: "var(--warmBg)", color: "var(--warmInk)" },
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
