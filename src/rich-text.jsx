import React, { useEffect, useRef, useState } from "react";

// Редактор конспекта: contenteditable плюс панель кнопок.
//
// Поле намеренно неуправляемое. Если писать innerHTML на каждый рендер, курсор
// прыгает в начало после каждой буквы, поэтому содержимое ставится один раз —
// при монтировании и при смене ветки (docId), — а наружу уходит через onChange.
const DEFAULT_HIGHLIGHT = "#F2E7B8";

export default function RichText({ docId, html, onChange, placeholder, large }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(DEFAULT_HIGHLIGHT);
  // Выбор цвета открывает системную палитру и забирает фокус, поэтому выделение
  // приходится запоминать до того, как оно потеряется.
  const savedRange = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (html || "")) {
      ref.current.innerHTML = html || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  function exec(command, value) {
    // styleWithCSS заставляет браузер писать style="background-color: …" вместо <font>,
    // иначе подсветку нельзя снять — «прозрачный» цвет такому тегу не задать.
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(command, false, value);
    onChange(ref.current.innerHTML);
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount && ref.current && ref.current.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  }

  function withSelection(action) {
    const selection = window.getSelection();
    const inside = ref.current && selection && selection.rangeCount && ref.current.contains(selection.anchorNode);
    if (!inside && savedRange.current) {
      ref.current.focus();
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    action();
  }

  // Кнопка панели забирает фокус у поля, выделение теряется, и форматирование
  // применяется не к выбранному тексту, а к началу конспекта. Не отдаём фокус.
  function keepSelection(e) {
    e.preventDefault();
  }

  // Вставка из браузера тащит за собой чужую вёрстку и скрипты — берём только текст.
  function handlePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
    onChange(ref.current.innerHTML);
  }

  const empty = !html || html === "<br>" || html === "<div><br></div>";

  // Панель — подписями, а не значками: «H», «•—» и «✕ф» приходилось угадывать.
  // Кнопки с палец высотой; на узком экране панель прокручивается вбок, а не
  // переносится в три ряда над текстом.
  const B = (label, title, onClick, extra) => (
    <button type="button" onMouseDown={keepSelection} onClick={onClick} style={{ ...styles.btn, ...extra }} title={title} aria-label={title}>
      {label}
    </button>
  );

  return (
    <div style={large ? styles.wrapLarge : styles.wrap}>
      <div role="toolbar" aria-label="Форматирование" className="ap-rt-toolbar" style={large ? styles.toolbarLarge : styles.toolbar}>
        {B("Ж", "Жирный", () => exec("bold"), { fontWeight: 700 })}
        {B("К", "Курсив", () => exec("italic"), { fontStyle: "italic" })}
        {B("П", "Подчёркнутый", () => exec("underline"), { textDecoration: "underline" })}
        <span style={styles.sep} />
        {B("Заголовок", "Заголовок", () => exec("formatBlock", "<h3>"))}
        {B("• Список", "Список", () => exec("insertUnorderedList"))}
        {B("1. Список", "Нумерованный список", () => exec("insertOrderedList"))}
        <span style={styles.sep} />
        {B("Маркер", "Выделить выбранным цветом", () => exec("hiliteColor", highlight), { background: highlight, color: "#22201B" })}
        <input
          type="color"
          value={highlight}
          onMouseDown={rememberSelection}
          onChange={(e) => {
            const color = e.target.value;
            setHighlight(color);
            withSelection(() => exec("hiliteColor", color));
          }}
          style={styles.colorInput}
          title="Цвет маркера"
          aria-label="Цвет маркера"
        />
        {B("Без маркера", "Снять выделение", () => exec("hiliteColor", "transparent"))}
        {B("Очистить", "Убрать форматирование", () => exec("removeFormat"), { color: "var(--ink3)" })}
      </div>
      <div style={styles.editorWrap}>
        {empty && !focused && <div style={large ? styles.placeholderLarge : styles.placeholder}>{placeholder || "Конспект, определения, примеры…"}</div>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          className="ap-rt-editor"
          onInput={() => onChange(ref.current.innerHTML)}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            rememberSelection();
            setFocused(false);
          }}
          style={large ? styles.editorLarge : styles.editor}
        />
      </div>
    </div>
  );
}
const styles = {
  wrap: { border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel2)", overflow: "hidden" },
  wrapLarge: { display: "flex", flexDirection: "column", gap: 10 },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    flexWrap: "nowrap",
    overflowX: "auto",
    padding: 4,
    borderBottom: "1px solid var(--line2)",
    background: "var(--neutralBg)",
    scrollbarWidth: "none",
  },
  toolbarLarge: {
    display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", overflowX: "auto", alignSelf: "flex-start", maxWidth: "100%",
    padding: 4, border: "1px solid var(--line2)", borderRadius: 12, background: "var(--panel2)", scrollbarWidth: "none",
  },
  btn: {
    flexShrink: 0,
    border: "none",
    background: "transparent",
    borderRadius: 8,
    minWidth: 34,
    height: 34,
    padding: "0 9px",
    fontSize: 13,
    color: "var(--ink2)",
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  sep: { flexShrink: 0, width: 1, height: 18, background: "var(--line)", margin: "0 4px" },
  colorInput: {
    flexShrink: 0,
    width: 30,
    height: 30,
    padding: 0,
    border: "1px solid var(--line)",
    borderRadius: 8,
    background: "transparent",
    cursor: "pointer",
  },
  editorWrap: { position: "relative" },
  placeholder: { position: "absolute", top: 12, left: 12, fontSize: 14, color: "var(--mute)", pointerEvents: "none" },
  placeholderLarge: { position: "absolute", top: 2, left: 0, fontSize: 16, color: "var(--mute)", pointerEvents: "none" },
  editor: { minHeight: 110, padding: 12, fontSize: 14.5, lineHeight: 1.6, outline: "none", overflowWrap: "anywhere" },
  editorLarge: { minHeight: 260, padding: "2px 0", fontSize: 16, lineHeight: 1.7, outline: "none", overflowWrap: "anywhere", maxWidth: 760 },
};