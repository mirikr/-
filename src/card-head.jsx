import React, { useState } from "react";
import { isClassic } from "./design.js";

// Заголовок карточки с пояснением, спрятанным под знак вопроса.
//
// Пояснения нужны один раз. Дальше они занимают половину экрана и мешают
// смотреть на то, ради чего человек сюда пришёл, — поэтому по умолчанию их
// видно, только пока в разделе пусто: там объяснять и правда нечего, кроме
// как словами. Появились данные — пояснение сворачивается само, а знак
// вопроса рядом с заголовком остаётся: нажал — вернулось.
//
// Выбор человека сильнее этого правила: если он свернул пояснение в пустом
// разделе или раскрыл его в полном, так и останется.
//
// Хранится это в localStorage, а не в общих записях: раскрытая подсказка —
// удобство одного устройства, и синхронизировать её между телефоном и
// ноутбуком незачем. В приватном окне localStorage может и не ответить —
// тогда просто работает правило по умолчанию.
const KEY = "planner-hints";

function readHints() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function writeHint(id, open) {
  try {
    const all = readHints();
    all[id] = open;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (e) {
    /* приватное окно — подсказка просто не запомнится */
  }
}

// Что показывать: выбор человека, если он был, иначе правило пустого раздела.
export function hintVisible(saved, empty) {
  return typeof saved === "boolean" ? saved : !!empty;
}

export function CardHead({ id, title, note, empty, small, children }) {
  const [saved, setSaved] = useState(() => (id ? readHints()[id] : undefined));
  const show = hintVisible(saved, empty);

  function toggle() {
    const want = !show;
    setSaved(want);
    if (id) writeHint(id, want);
  }

  // В прежнем дизайне заголовок мельче и плотнее — как было в 0.14.0.
  const classic = isClassic();
  return (
    <>
      <div style={classic ? S.headClassic : S.head}>
        <div style={small ? S.titleSmall : classic ? S.titleClassic : S.title}>{title}</div>
        {note ? (
          <button
            type="button"
            onClick={toggle}
            className="ap-row"
            style={{ ...S.ask, ...(show ? S.askOn : null) }}
            aria-expanded={show}
            aria-label={show ? "Скрыть пояснение: " + title : "Что это: " + title}
            title={show ? "Скрыть пояснение" : "Что это"}
          >
            ?
          </button>
        ) : null}
        {children ? <div style={S.side}>{children}</div> : null}
      </div>
      {note && show ? <div style={S.note}>{note}</div> : null}
    </>
  );
}

const S = {
  head: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  title: { fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.25 },
  headClassic: { display: "flex", alignItems: "center", gap: 7, marginBottom: 5 },
  titleClassic: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19 },
  // Мелкий заголовок — для строки-пояснения, у которой нет своей карточки.
  titleSmall: { fontSize: 13, color: "var(--mute)", lineHeight: 1.4 },
  side: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 },
  ask: {
    width: 22, height: 22, flexShrink: 0, borderRadius: 999, padding: 0,
    border: "1px solid var(--line)", background: "none", color: "var(--mute)",
    fontSize: 12, lineHeight: 1, cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  },
  askOn: { borderColor: "var(--ink3)", color: "var(--ink3)" },
  note: { fontSize: 13.5, color: "var(--ink3)", marginBottom: 14, lineHeight: 1.5 },
};
