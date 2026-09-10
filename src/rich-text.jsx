import React, { useEffect, useRef, useState } from "react";

// Редактор конспекта: contenteditable плюс панель кнопок.
//
// Поле намеренно неуправляемое. Если писать innerHTML на каждый рендер, курсор
// прыгает в начало после каждой буквы, поэтому содержимое ставится один раз —
// при монтировании и при смене ветки (docId), — а наружу уходит через onChange.
const DEFAULT_HIGHLIGHT = "#F2E7B8";

export default function RichText({ docId, html, onChange, placeholder }) {
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

  return (
    <div style={styles.wrap}>
      <div style={styles.toolbar}>
        <button onMouseDown={keepSelection} onClick={() => exec("bold")} style={{ ...styles.btn, fontWeight: 700 }} title="Жирный">
          Ж
        </button>
        <button onMouseDown={keepSelection} onClick={() => exec("italic")} style={{ ...styles.btn, fontStyle: "italic" }} title="Курсив">
          К
        </button>
        <button onMouseDown={keepSelection} onClick={() => exec("underline")} style={{ ...styles.btn, textDecoration: "underline" }} title="Подчёркнутый">
          П
        </button>
        <span style={styles.sep} />
        <button onMouseDown={keepSelection} onClick={() => exec("formatBlock", "<h3>")} style={styles.btn} title="Заголовок">
          H
        </button>
        <button onMouseDown={keepSelection} onClick={() => exec("insertUnorderedList")} style={styles.btn} title="Список">
          •—
        </button>
        <button onMouseDown={keepSelection} onClick={() => exec("insertOrderedList")} style={styles.btn} title="Нумерованный список">
          1.
        </button>
        <span style={styles.sep} />
        <button
          onMouseDown={keepSelection}
          onClick={() => exec("hiliteColor", highlight)}
          style={{ ...styles.btn, background: highlight }}
          title="Выделить выбранным цветом"
        >
          ▉
        </button>
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
          title="Цвет выделения"
        />
        <button
          onMouseDown={keepSelection}
          onClick={() => exec("hiliteColor", "transparent")}
          style={styles.btn}
          title="Снять выделение"
        >
          ▢
        </button>
        <button onMouseDown={keepSelection} onClick={() => exec("removeFormat")} style={styles.btn} title="Убрать форматирование">
          ✕ф
        </button>
      </div>
      <div style={styles.editorWrap}>
        {empty && !focused && <div style={styles.placeholder}>{placeholder || "Конспект, определения, примеры…"}</div>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={() => onChange(ref.current.innerHTML)}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            rememberSelection();
            setFocused(false);
          }}
          style={styles.editor}
        />
      </div>
    </div>
  );
}

const styles = {
  wrap: { border: "1px solid #C9C1AC", borderRadius: 5, background: "#fff", overflow: "hidden" },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    flexWrap: "wrap",
    padding: "5px 6px",
    borderBottom: "1px solid #E7E1D2",
    background: "#F7F4EC",
  },
  btn: {
    border: "1px solid #DCD5C4",
    background: "#fff",
    borderRadius: 3,
    minWidth: 26,
    padding: "3px 6px",
    fontSize: 12,
    color: "#2B2822",
    lineHeight: 1.2,
  },
  sep: { width: 1, height: 16, background: "#DCD5C4", margin: "0 3px" },
  colorInput: {
    width: 28,
    height: 24,
    padding: 0,
    border: "1px solid #DCD5C4",
    borderRadius: 3,
    background: "#fff",
    cursor: "pointer",
  },
  editorWrap: { position: "relative" },
  placeholder: { position: "absolute", top: 10, left: 10, fontSize: 13, color: "#B9B2A0", pointerEvents: "none" },
  editor: { minHeight: 110, padding: 10, fontSize: 13.5, lineHeight: 1.6, outline: "none", overflowWrap: "anywhere" },
};
