import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatSize } from "./files.js";
import { fileId, searchFiles } from "./file-library.js";

// Окно «Выбрать из загруженных»: все файлы приложения — из заданий, тетрадей и
// заметок к урокам — с поиском. Выбранный файл не копируется: к заданию или
// ветке тетради добавляется ссылка на тот же файл, и он виден в обоих местах.
//
// Список приходит из контекста: приложение кладёт в него все файлы, а кнопка
// «Из загруженных» появляется везде, где есть вложения.
export const FileLibraryContext = createContext(null);

export function useFileLibrary() {
  return useContext(FileLibraryContext);
}

function extOf(name) {
  const dot = String(name || "").lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).slice(0, 4).toUpperCase() : "ФАЙЛ";
}

function filesWord(n) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return "файлов";
  if (last === 1) return "файл";
  if (last >= 2 && last <= 4) return "файла";
  return "файлов";
}

export function FilePicker({ entries, have, subject, onPick, onClose, where }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const inputRef = useRef(null);
  const haveIds = useMemo(() => new Set((have || []).map(fileId)), [have]);
  const found = useMemo(() => searchFiles(entries || [], query, subject), [entries, query, subject]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function toggle(id) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function done() {
    const byId = new Map((entries || []).map((e) => [e.id, e.file]));
    onPick(picked.map((id) => byId.get(id)).filter(Boolean));
    onClose();
  }

  // Окно — поверх всего приложения, а не внутри карточки: у карточек бывают
  // размытие и прокрутка, и внутри них «fixed» обрезалось по краю карточки.
  // Кладём в оболочку приложения, чтобы действовали цвета темы.
  const host = (typeof document !== "undefined" && (document.querySelector(".ap-shell") || document.body)) || null;
  const view = (
    <div style={S.overlay} onClick={onClose}>
      <div
        className="ap-dialog"
        style={S.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Выбрать из загруженных"
      >
        <div style={S.head}>
          <div style={S.titleBox}>
            <div style={S.title}>Выбрать из загруженных</div>
            {where ? <div style={S.where}>Добавить: {where}</div> : null}
          </div>
          <button onClick={onClose} style={S.close} title="Закрыть" aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div style={S.searchRow}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && picked.length && done()}
            placeholder="Поиск по названию, предмету, блоку…"
            aria-label="Поиск файла"
            style={S.search}
          />
        </div>
        <div style={S.note}>
          Файл не копируется: в новом месте появится тот же самый файл. Убрать его оттуда можно отдельно — в остальных
          местах он останется.
        </div>
        <div style={S.list} role="listbox" aria-multiselectable="true" aria-label="Файлы">
          {!(entries || []).length ? (
            <div style={S.empty}>Загруженных файлов пока нет.</div>
          ) : !found.length ? (
            <div style={S.empty}>Ничего не нашлось.</div>
          ) : (
            found.map((e) => {
              const here = haveIds.has(e.id);
              const on = picked.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={here}
                  onClick={() => toggle(e.id)}
                  data-file={e.file.name}
                  style={{ ...S.row, ...(on ? S.rowOn : null), ...(here ? S.rowHere : null) }}
                >
                  <span style={S.ext} aria-hidden="true">{extOf(e.file.name)}</span>
                  <span style={S.info}>
                    <span style={S.name}>{e.file.name}</span>
                    <span style={S.places}>
                      {e.places.slice(0, 2).map((p) => p.label).join(" · ")}
                      {e.places.length > 2 ? " · ещё " + (e.places.length - 2) : ""}
                    </span>
                  </span>
                  <span style={S.side}>
                    {here ? "уже здесь" : on ? "✓" : formatSize(e.file.size)}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div style={S.foot}>
          <span style={S.count}>{found.length} {filesWord(found.length)}</span>
          <button onClick={onClose} style={S.cancel}>Отмена</button>
          <button onClick={done} disabled={!picked.length} style={{ ...S.ok, ...(picked.length ? null : S.off) }}>
            {picked.length ? "Прикрепить (" + picked.length + ")" : "Прикрепить"}
          </button>
        </div>
      </div>
    </div>
  );
  return host ? createPortal(view, host) : view;
}

// Кнопка «Из загруженных» с окном. have — файлы, что уже есть в этом месте.
export function PickExistingButton({ have, subject, where, onPick, style, label }) {
  const lib = useFileLibrary();
  const [open, setOpen] = useState(false);
  if (!lib) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={style || S.pickBtn} title="Выбрать файл, который уже загружен в задание или тетрадь">
        {label || "Из загруженных"}
      </button>
      {open && (
        <FilePicker
          entries={lib.entries}
          have={have}
          subject={subject}
          where={where}
          onPick={(files) => {
            const ids = new Set((have || []).map(fileId));
            onPick(files.filter((f) => !ids.has(fileId(f))));
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 140, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    background: "rgba(24, 22, 18, 0.45)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
  },
  dialog: {
    width: "100%", maxWidth: 560, maxHeight: "86vh", display: "flex", flexDirection: "column",
    background: "var(--menuBg, var(--panel))", border: "1px solid var(--line)", borderRadius: 16,
    boxShadow: "0 18px 50px rgba(0,0,0,0.3)", color: "var(--ink)", overflow: "hidden",
  },
  head: { display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 18px 10px" },
  titleBox: { flex: 1, minWidth: 0 },
  title: { fontFamily: "var(--serif)", fontSize: 21 },
  where: { fontSize: 12.5, color: "var(--ink3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  close: {
    border: "1px solid var(--line)", background: "transparent", color: "var(--ink2)", borderRadius: 9,
    width: 34, height: 34, fontSize: 13, lineHeight: 1, flexShrink: 0, cursor: "pointer",
  },
  searchRow: { padding: "0 18px 8px" },
  search: {
    width: "100%", boxSizing: "border-box", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px",
    font: "inherit", fontSize: 15, background: "var(--panel)", color: "var(--ink)",
  },
  note: { padding: "0 18px 10px", fontSize: 12, color: "var(--mute)", lineHeight: 1.45 },
  list: { flex: 1, overflowY: "auto", padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 4, minHeight: 120 },
  empty: { padding: "24px 8px", textAlign: "center", fontSize: 14, color: "var(--mute)" },
  row: {
    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px",
    border: "1px solid var(--line2)", borderRadius: 10, background: "var(--panel)", color: "var(--ink)",
    font: "inherit", cursor: "pointer", minWidth: 0,
  },
  rowOn: { borderColor: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--ink)" },
  rowHere: { opacity: 0.55, cursor: "default" },
  ext: {
    flex: "0 0 auto", minWidth: 40, textAlign: "center", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
    padding: "6px 4px", borderRadius: 7, background: "var(--panel2)", border: "1px solid var(--line2)", color: "var(--ink3)",
  },
  info: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  places: { fontSize: 12, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  side: { flex: "0 0 auto", fontSize: 12, color: "var(--mute)", fontVariantNumeric: "tabular-nums" },
  foot: { display: "flex", alignItems: "center", gap: 10, padding: "10px 18px 14px", borderTop: "1px solid var(--line2)" },
  count: { flex: 1, fontSize: 12.5, color: "var(--mute)" },
  cancel: {
    border: "1px solid var(--line)", background: "transparent", color: "var(--ink2)", borderRadius: 9,
    padding: "8px 14px", font: "inherit", fontSize: 13.5, cursor: "pointer",
  },
  ok: {
    border: "1px solid var(--btnBg)", background: "var(--btnBg)", color: "var(--btnInk)", borderRadius: 9,
    padding: "8px 14px", font: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
  },
  off: { opacity: 0.45, cursor: "default" },
  pickBtn: {
    border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink2)", borderRadius: 8,
    padding: "5px 10px", font: "inherit", fontSize: 12.5, cursor: "pointer",
  },
};
