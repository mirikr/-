import React, { useEffect, useRef, useState } from "react";

// Меню «⋯». Редкие и опасные действия — переименовать, поменять цвет, удалить —
// раньше стояли крестиками и полями прямо рядом с названиями: удалить предмет
// можно было, целясь в выбор цвета. Теперь они за одной кнопкой.
//
// items: [{ label, onSelect, danger, render }] — render рисует свой элемент
// вместо пункта (например, выбор цвета), onSelect закрывает меню после вызова.
export default function MoreMenu({ label, items, size = 36, align = "right", quiet }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function outside(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} style={S.wrap}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ap-row"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        style={{ ...S.trigger, ...(quiet ? S.quiet : null), width: size, height: size }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div role="menu" style={{ ...S.menu, [align === "left" ? "left" : "right"]: 0 }}>
          {items.filter(Boolean).map((item, i) =>
            item.render ? (
              <div key={i} style={S.custom}>
                {item.render()}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="ap-menu-item"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                style={{ ...S.item, color: item.danger ? "var(--red)" : "var(--ink)" }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { position: "relative", flexShrink: 0 },
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: "transparent",
    color: "var(--ink2)",
    cursor: "pointer",
  },
  // В строках списка рамка у каждой «⋯» давала столбик кнопок — там она без рамки.
  quiet: { border: "1px solid transparent", color: "var(--mute)" },
  menu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    zIndex: 40,
    minWidth: 210,
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    boxShadow: "0 12px 32px rgba(0,0,0,.16)",
  },
  item: {
    display: "block",
    width: "100%",
    minHeight: 40,
    padding: "0 12px",
    border: "none",
    borderRadius: 8,
    background: "transparent",
    textAlign: "left",
    fontSize: 14,
    cursor: "pointer",
  },
  custom: { padding: "6px 12px" },
};
