import React from "react";
import { THEME_CSS } from "./theme.js";

// Последняя страховка: если что-то в приложении упало, человек не должен
// видеть белый лист.
//
// Так уже было — одна кривая запись, приехавшая с другого устройства, и вместо
// ежедневника пустая страница. Страшно тут не то, что приложение сломалось, а
// то, что кажется, будто пропали записи. На самом деле они лежат в браузере
// целыми, поэтому первое, что здесь есть, — способ забрать их себе.
//
// Всё внутри обёрнуто в try/catch: экран аварии, который падает сам, хуже
// белого листа.
const PREFIX = "planner:";

function readAll() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) out[key] = localStorage.getItem(key);
    }
  } catch (e) {
    /* приватный режим — вернём, что есть */
  }
  return out;
}

function backupText() {
  try {
    return JSON.stringify({ savedAt: new Date().toISOString(), keys: readAll() }, null, 2);
  } catch (e) {
    return "";
  }
}

function countRecords(raw) {
  try {
    const wrapper = JSON.parse(raw[PREFIX + "planner-state-v5"] || "null");
    const state = wrapper && wrapper.value ? JSON.parse(wrapper.value) : {};
    const n = (list) => (Array.isArray(list) ? list.length : 0);
    return n(state.journal) + n(state.homework) + n(state.events) + n(state.lyceumSchedule);
  } catch (e) {
    return 0;
  }
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, message: "", saved: "" };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, message: String((error && error.message) || error || "неизвестная ошибка") };
  }

  componentDidCatch(error, info) {
    // В консоль — целиком: по одной строке на экране причину не найти.
    try {
      console.error("Ежедневник упал:", error, info);
    } catch (e) {
      /* консоли может не быть */
    }
  }

  download = () => {
    try {
      const blob = new Blob([backupText()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ежедневник-копия.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.setState({ saved: "Файл сохранён." });
    } catch (e) {
      this.setState({ saved: "Не вышло сохранить файл — скопируйте текст ниже." });
    }
  };

  copy = () => {
    const text = backupText();
    try {
      navigator.clipboard.writeText(text).then(
        () => this.setState({ saved: "Скопировано." }),
        () => this.setState({ saved: "Не вышло скопировать — выделите текст ниже вручную." })
      );
    } catch (e) {
      this.setState({ saved: "Не вышло скопировать — выделите текст ниже вручную." });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const raw = readAll();
    const records = countRecords(raw);
    return (
      <div style={styles.page}>
        {/* Палитру приносим с собой: стили приложения живут внутри упавшего
            компонента, и без этого экран остался бы без цветов. */}
        <style>{THEME_CSS}</style>
        <div style={styles.card}>
          <div style={styles.title}>Приложение сломалось</div>
          <p style={styles.text}>
            Записи целы — они лежат в памяти этого браузера{records ? `, их там ${records}` : ""}. Прежде чем что-то
            делать, заберите копию: с ней ничего не потеряется, даже если чинить придётся долго.
          </p>
          <div style={styles.row}>
            <button onClick={this.download} style={styles.primary}>
              Скачать копию
            </button>
            <button onClick={this.copy} style={styles.secondary}>
              Скопировать
            </button>
            <button onClick={() => window.location.reload()} style={styles.secondary}>
              Перезагрузить
            </button>
          </div>
          {this.state.saved && <div style={styles.saved}>{this.state.saved}</div>}
          <textarea readOnly value={backupText()} style={styles.dump} onFocus={(e) => e.target.select()} />
          <div style={styles.why}>Что случилось: {this.state.message}</div>
          <p style={styles.hint}>
            Если после перезагрузки повторяется — покажите эту строчку тому, кто делал приложение. Пока не почините,
            копия из поля выше вставляется обратно в «Синхронизации», в «Резервной копии».
          </p>
        </div>
      </div>
    );
  }
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--ink)",
    padding: "32px 16px",
    fontFamily: "'Golos Text', system-ui, -apple-system, 'Segoe UI', sans-serif",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  card: {
    width: "100%",
    maxWidth: 620,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "22px 22px 20px",
  },
  title: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 22, marginBottom: 8 },
  text: { fontSize: 14, color: "var(--ink2)", lineHeight: 1.6, marginTop: 0, marginBottom: 16 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  primary: {
    background: "var(--btnBg)",
    color: "var(--btnInk)",
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    fontSize: 13.5,
    fontWeight: 600,
  },
  secondary: {
    background: "var(--panel2)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "9px 14px",
    fontSize: 13.5,
  },
  saved: { fontSize: 12.5, color: "var(--green)", marginBottom: 8 },
  dump: {
    width: "100%",
    height: 120,
    background: "var(--panel2)",
    color: "var(--ink3)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: 10,
    fontSize: 11,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    resize: "vertical",
  },
  why: {
    marginTop: 12,
    fontSize: 12,
    color: "var(--red)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    overflowWrap: "anywhere",
  },
  hint: { fontSize: 12.5, color: "var(--mute)", lineHeight: 1.6, marginBottom: 0 },
};
