import React, { useEffect, useState } from "react";

const HIDDEN_KEY = "planner-install-hint-hidden";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // На iPadOS Safari прикидывается макбуком, поэтому смотрим ещё и на касания.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function isHandheld() {
  if (typeof window === "undefined") return false;
  return (window.matchMedia && window.matchMedia("(max-width: 820px)").matches) || navigator.maxTouchPoints > 0;
}

// Кнопка «Установить на телефон» и окно с инструкцией. Приложение, добавленное на
// экран «Домой», открывается без адресной строки и работает офлайн — но браузеры
// сами об этом не сообщают, а на iOS установка возможна только вручную.
export default function InstallHint() {
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(HIDDEN_KEY) === "1";
    } catch (e) {
      /* приватный режим — просто покажем кнопку */
    }
    setHidden(dismissed || isStandalone() || !isHandheld());

    // Chrome на Android умеет ставить приложение сам, но только по этому событию.
    function capture(e) {
      e.preventDefault();
      setPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  function hideForever() {
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch (e) {
      /* не смогли запомнить — переживём */
    }
    setOpen(false);
    setHidden(true);
  }

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    setPrompt(null);
    if (choice && choice.outcome === "accepted") hideForever();
  }

  if (hidden) return null;

  return (
    <div style={styles.bar}>
      <button onClick={() => setOpen(true)} style={styles.button}>
        Установить на телефон
      </button>

      {open && (
        <div style={styles.overlay} onClick={() => setOpen(false)}>
          <div style={styles.card} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Установка приложения">
            <div style={styles.title}>Ежедневник на экране «Домой»</div>
            <p style={styles.text}>
              Установленный ежедневник открывается с иконки, без адресной строки браузера, и работает без интернета —
              записи сохраняются на устройстве и уходят в облако, когда связь появится.
            </p>

            {prompt ? (
              <>
                <p style={styles.text}>Браузер может установить приложение сам:</p>
                <button onClick={install} style={styles.primary}>
                  Установить
                </button>
              </>
            ) : isIOS() ? (
              <ol style={styles.list}>
                <li>Откройте эту страницу в Safari.</li>
                <li>
                  Нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх, внизу экрана.
                </li>
                <li>
                  Выберите <b>«На экран „Домой“»</b> и подтвердите.
                </li>
              </ol>
            ) : (
              <ol style={styles.list}>
                <li>Откройте меню браузера — три точки или три полоски.</li>
                <li>
                  Найдите пункт <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.
                </li>
                <li>Подтвердите добавление.</li>
              </ol>
            )}

            <div style={styles.actions}>
              <button onClick={() => setOpen(false)} style={styles.secondary}>
                Закрыть
              </button>
              <button onClick={hideForever} style={styles.link}>
                Больше не предлагать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  bar: { maxWidth: 880, margin: "0 auto", padding: "10px 20px 0", fontFamily: "Inter, system-ui, sans-serif" },
  button: {
    border: "1px solid #C9C1AC",
    background: "#F7F4EC",
    borderRadius: 4,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    color: "#5A5347",
    cursor: "pointer",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(43, 40, 34, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 100,
  },
  card: {
    background: "#F7F4EC",
    border: "1px solid #DCD5C4",
    borderRadius: 8,
    padding: 20,
    maxWidth: 420,
    width: "100%",
    boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
    color: "#2B2822",
  },
  title: { fontFamily: "'PT Serif', Georgia, serif", fontSize: 19, marginBottom: 10 },
  text: { fontSize: 13.5, lineHeight: 1.55, color: "#4A4638", margin: "0 0 10px" },
  list: { fontSize: 13.5, lineHeight: 1.65, color: "#4A4638", margin: "0 0 12px", paddingLeft: 20 },
  primary: {
    border: "none",
    background: "#2B2822",
    color: "#fff",
    borderRadius: 4,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 12,
    cursor: "pointer",
  },
  actions: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 6 },
  secondary: {
    border: "1px solid #C9C1AC",
    background: "#fff",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    color: "#2B2822",
    cursor: "pointer",
  },
  link: {
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 12.5,
    color: "#8A8370",
    textDecoration: "underline",
    cursor: "pointer",
  },
};
