import { useEffect, useState } from "react";

// Палитра приложения в двух видах. Раньше цвета стояли прямо в стилях, и ночной
// темы быть не могло: чтобы перекрасить приложение, пришлось бы переписать
// каждую строку. Теперь цвет называется по смыслу — «фон», «линия», «текст
// послабее» — а какой он на самом деле, решает атрибут data-theme на обёртке.
export const THEME_CSS = `
html, body { background: var(--bg); color: var(--ink); }
[data-theme]{
  --bg:#EFEBE1;--panel:#FBF9F3;--panel2:#FFFDF8;--line:#DCD5C4;--line2:#E4DECD;
  --ink:#2B2822;--ink2:#5A5347;--ink3:#6B6656;--mute:#8A8370;
  --rail:#2B2822;--railInk:#EDE7D8;--railInk2:#CFC7B4;--railActive:#403C31;
  --accent:#8C7326;--accentInk:#FBF9F3;--gold:#C9A227;--green:#3F6E52;--red:#8B4A4A;
  --redStrong:#B23A3A;--blue:#2F4E70;--purple:#5C4A80;
  --warmBg:#FBF0D2;--warmLine:#E0C97C;--warmInk:#7A5A12;
  --redBg:#F9E2DF;--redLine:#D9A6A0;--neutralBg:#F1EEE4;
  --cellFull:#B6CFBC;--cellMid:#E6D79A;--cellLow:#E2B9B4;
  --barDim:#C9C1AC;--btnBg:#2B2822;--btnInk:#FBF9F3;
  --corridor:rgba(140,115,38,.09);--corridorLine:#B8A879;
  --shadow:0 10px 26px rgba(43,40,34,.1);
  color-scheme:light;
}
[data-theme="night"]{
  --bg:#171612;--panel:#1E1C16;--panel2:#211F19;--line:#34312A;--line2:#2A2821;
  --ink:#EDE7D8;--ink2:#D9D2C0;--ink3:#A49B85;--mute:#A49B85;
  --rail:#12110E;--railInk:#EDE7D8;--railInk2:#BDB4A0;--railActive:#211F19;
  --accent:#E8C468;--accentInk:#171612;--gold:#E8C468;--green:#7FB08C;--red:#C96A60;
  --redStrong:#C96A60;--blue:#9FC2E0;--purple:#A992D0;
  --warmBg:#2A2417;--warmLine:#5A4A20;--warmInk:#E8C468;
  --redBg:#2A1D1B;--redLine:#5A322C;--neutralBg:#211F19;
  --cellFull:#3A5C44;--cellMid:#7A6528;--cellLow:#6E3A34;
  --barDim:#8A5049;--btnBg:#E8C468;--btnInk:#171612;
  --corridor:rgba(232,196,104,.08);--corridorLine:rgba(232,196,104,.5);
  --shadow:0 10px 26px rgba(0,0,0,.4);
  color-scheme:dark;
}
/* Ползунок масштаба под графиком часов. Системный вид у него слишком яркий
   и в ночной теме светится белым, поэтому дорожка и бегунок свои. */
/* При живом фоне карточки становятся стеклом: переопределяем сами токены, а
   не фон каждой карточки — иначе пришлось бы перебивать инлайновые стили, и
   тёплые подсветки напоминаний потеряли бы цвет. */
.ap-live-bg {
  --panel: rgba(251, 249, 243, 0.78);
  --panel2: rgba(255, 253, 248, 0.7);
  --warmBg: rgba(251, 240, 210, 0.78);
  --redBg: rgba(249, 226, 223, 0.78);
  --neutralBg: rgba(241, 238, 228, 0.7);
}
.ap-live-bg[data-theme="night"] {
  --panel: rgba(30, 28, 22, 0.74);
  --panel2: rgba(33, 31, 25, 0.66);
  --warmBg: rgba(42, 36, 23, 0.78);
  --redBg: rgba(42, 29, 27, 0.78);
  --neutralBg: rgba(33, 31, 25, 0.66);
}
.ap-live-bg .ap-card,
.ap-live-bg .ap-dialog {
  backdrop-filter: blur(14px) saturate(1.05);
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
}

/* Живой фон рисуется под интерфейсом. Колонка и экран статичны, а холст
   позиционирован, поэтому без явного слоя он лёг бы поверх них. */
.ap-rail, .ap-main, .ap-tabbar { position: relative; z-index: 1; }

.ap-range { -webkit-appearance: none; appearance: none; height: 22px; background: none; }
.ap-range:focus { outline: none; }
.ap-range::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: var(--line); }
.ap-range::-moz-range-track { height: 4px; border-radius: 999px; background: var(--line); }
.ap-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 18px; height: 18px; margin-top: -7px;
  border-radius: 50%; background: var(--btnBg); border: 2px solid var(--panel); cursor: pointer;
}
.ap-range::-moz-range-thumb {
  width: 16px; height: 16px; border-radius: 50%; background: var(--btnBg);
  border: 2px solid var(--panel); cursor: pointer;
}
.ap-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--corridorLine); }

.ap-balance-tip { position: absolute; }
/* На телефоне накладка перекрыла бы весь график, поэтому разбор встаёт под ним. */
@media (max-width: 700px) {
  .ap-balance-tip {
    position: static !important;
    width: auto !important;
    margin: 10px 0 0 !important;
    box-shadow: none !important;
  }
}
`;

const MODE_KEY = "planner-theme-mode";
const WINDOW_KEY = "planner-theme-night-window";

// Границы ночи по умолчанию. Это не про астрономию, а про то, когда за
// ежедневником сидят при выключенном свете; у каждого это своё время, поэтому
// границы можно поменять в разделе «Синхронизация».
export const DEFAULT_NIGHT = { from: 20, to: 7 };

export function isNightHour(hour, window = DEFAULT_NIGHT) {
  const { from, to } = window;
  if (from === to) return false;
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
}

function clampHour(value, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : fallback;
}

function readWindow() {
  try {
    const saved = JSON.parse(localStorage.getItem(WINDOW_KEY) || "null");
    if (saved) {
      return { from: clampHour(saved.from, DEFAULT_NIGHT.from), to: clampHour(saved.to, DEFAULT_NIGHT.to) };
    }
  } catch (e) {
    /* приватный режим — вернём значения по умолчанию */
  }
  return DEFAULT_NIGHT;
}

function readMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "light" || saved === "night" || saved === "auto") return saved;
  } catch (e) {
    /* приватный режим — просто останемся на «авто» */
  }
  return "auto";
}

// Режим темы — настройка устройства, а не данных: телефон вечером в ночной,
// ноутбук днём в светлой. Поэтому он лежит в localStorage и в облако не едет.
export function useThemeMode() {
  const [mode, setModeState] = useState(readMode);
  const [nightWindow, setNightWindowState] = useState(readWindow);
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), 60000);
    return () => clearInterval(timer);
  }, []);

  function setMode(next) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch (e) {
      /* не сохранилось — переживём до перезагрузки */
    }
  }

  function setNightWindow(next) {
    const value = { from: clampHour(next.from, nightWindow.from), to: clampHour(next.to, nightWindow.to) };
    setNightWindowState(value);
    try {
      localStorage.setItem(WINDOW_KEY, JSON.stringify(value));
    } catch (e) {
      /* не сохранилось — переживём до перезагрузки */
    }
  }

  const theme = mode === "auto" ? (isNightHour(hour, nightWindow) ? "night" : "light") : mode;

  // Атрибут ставится на <html>, а не только на обёртку приложения: иначе фон
  // страницы за её пределами остаётся светлым, а панель входа — без палитры.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    // Цвет строки браузера и полосы состояния на телефоне: без него сверху
    // оставалась светлая полоса, даже когда всё приложение тёмное.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "night" ? "#171612" : "#EFEBE1");
  }, [theme]);

  return { mode, setMode, theme, night: theme === "night", nightWindow, setNightWindow };
}
