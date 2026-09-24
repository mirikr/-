import { useEffect, useState } from "react";

// Палитра приложения в двух видах. Раньше цвета стояли прямо в стилях, и ночной
// темы быть не могло: чтобы перекрасить приложение, пришлось бы переписать
// каждую строку. Теперь цвет называется по смыслу — «фон», «линия», «текст
// послабее» — а какой он на самом деле, решает атрибут data-theme на обёртке.
export const THEME_CSS = `
html, body { background: var(--bg); color: var(--ink); }
[data-theme]{
  --bg:#F1ECE1;--panel:#FBF8F1;--panel2:#FFFDF8;--line:#DDD5C4;--line2:#E8E1D2;
  --ink:#22201B;--ink2:#4A453B;--ink3:#6B6558;--mute:#7A7363;
  --rail:#24221D;--railInk:#EFE8D8;--railInk2:#A9A290;--railActive:#35322B;
  --accent:#8A6A1F;--accentInk:#FBF8F1;--accentSoft:#EDE2C6;--gold:#B8912A;--green:#2F6B4F;--greenSoft:#D9E6DC;--red:#A4452C;
  --redStrong:#A93A2E;--blue:#2F4E70;--purple:#5C4A80;
  --warmBg:#F5EACD;--warmLine:#DCC586;--warmInk:#6E5210;
  --redBg:#F4DED5;--redLine:#DDA999;--neutralBg:#EDE7DA;
  --cellFull:#B6CFBC;--cellMid:#E6D79A;--cellLow:#E2B9B4;
  --barDim:#C9C1AC;--btnBg:#22201B;--btnInk:#FBF8F1;
  --corridor:rgba(138,106,31,.09);--corridorLine:#B8A879;
  --shadow:0 1px 2px rgba(34,32,27,.05), 0 10px 28px rgba(34,32,27,.08);
  --focus:#8A6A1F;
  --serif:'PT Serif', Georgia, 'Times New Roman', serif;
  --sans:'Golos Text', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --radius:18px;--radiusSm:10px;
  color-scheme:light;
}
[data-theme="night"]{
  --bg:#171612;--panel:#211F1A;--panel2:#25231D;--line:#35322A;--line2:#2C2A23;
  --ink:#EDE7D8;--ink2:#D6CFBD;--ink3:#A8A08F;--mute:#9A927F;
  --rail:#100F0C;--railInk:#EDE7D8;--railInk2:#9C9483;--railActive:#24221D;
  --accent:#D9B45A;--accentInk:#171612;--accentSoft:#332C1E;--gold:#D9B45A;--green:#74B08E;--greenSoft:#22332A;--red:#DC8466;
  --redStrong:#E07A5F;--blue:#9FC2E0;--purple:#A992D0;
  --warmBg:#2B2518;--warmLine:#5A4A20;--warmInk:#E3C16C;
  --redBg:#3A241E;--redLine:#6A3A2F;--neutralBg:#25231D;
  --cellFull:#3A5C44;--cellMid:#7A6528;--cellLow:#6E3A34;
  --barDim:#8A5049;--btnBg:#EDE7D8;--btnInk:#171612;
  --corridor:rgba(217,180,90,.08);--corridorLine:rgba(217,180,90,.5);
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 30px rgba(0,0,0,.35);
  --focus:#D9B45A;
  color-scheme:dark;
}
/* Ползунок масштаба под графиком часов. Системный вид у него слишком яркий
   и в ночной теме светится белым, поэтому дорожка и бегунок свои. */
/* При живом фоне карточки становятся стеклом: переопределяем сами токены, а
   не фон каждой карточки — иначе пришлось бы перебивать инлайновые стили, и
   тёплые подсветки напоминаний потеряли бы цвет. */
.ap-live-bg {
  --panel: rgba(251, 249, 243, 0.62);
  --panel2: rgba(255, 253, 248, 0.5);
  --warmBg: rgba(251, 240, 210, 0.66);
  --redBg: rgba(249, 226, 223, 0.66);
  --neutralBg: rgba(241, 238, 228, 0.5);
}
.ap-live-bg[data-theme="night"] {
  --panel: rgba(30, 28, 22, 0.6);
  --panel2: rgba(33, 31, 25, 0.5);
  --warmBg: rgba(42, 36, 23, 0.66);
  --redBg: rgba(42, 29, 27, 0.66);
  --neutralBg: rgba(33, 31, 25, 0.5);
}
/* Чем прозрачнее стекло, тем сильнее размытие: движение за карточкой видно,
   а разобрать в нём отдельные точки нельзя — читать поверх такого фона можно. */
.ap-live-bg .ap-card,
.ap-live-bg .ap-dialog {
  backdrop-filter: blur(20px) saturate(1.08);
  -webkit-backdrop-filter: blur(20px) saturate(1.08);
}

/* На телефоне карточки занимают почти весь экран: фон виден только сквозь них,
   и при том же стекле, что на большом экране, от движения не остаётся ничего.
   Поэтому на узком экране стекло тоньше, а размытие слабее — иначе за карточкой
   видно муть, а не нити. */
@media (max-width: 900px) {
  .ap-live-bg {
    --panel: rgba(251, 249, 243, 0.46);
    --panel2: rgba(255, 253, 248, 0.36);
    --warmBg: rgba(251, 240, 210, 0.52);
    --redBg: rgba(249, 226, 223, 0.52);
    --neutralBg: rgba(241, 238, 228, 0.36);
  }
  .ap-live-bg[data-theme="night"] {
    --panel: rgba(30, 28, 22, 0.46);
    --panel2: rgba(33, 31, 25, 0.36);
    --warmBg: rgba(42, 36, 23, 0.52);
    --redBg: rgba(42, 29, 27, 0.52);
    --neutralBg: rgba(33, 31, 25, 0.36);
  }
  .ap-live-bg .ap-card,
  .ap-live-bg .ap-dialog {
    backdrop-filter: blur(11px) saturate(1.06);
    -webkit-backdrop-filter: blur(11px) saturate(1.06);
  }
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

/* Условие задания из банка ФИПИ: у них вёрстка на таблицах, и ломать её нельзя —
   в информатике таблица и есть половина задания, а в обществознании два столбца
   «А-Б-В» и «1-2-3» только так и читаются. Поэтому разметка приходит как есть, а
   здесь ей задаётся вид: раскладочные таблицы остаются невидимыми, а таблицы с
   данными получают сетку. */
.ap-fipi { font-size: 15px; line-height: 1.6; overflow-x: auto; }
.ap-fipi p { margin: 0 0 9px; }
.ap-fipi p:last-child { margin-bottom: 0; }
.ap-fipi table { border-collapse: collapse; max-width: 100%; }
.ap-fipi td, .ap-fipi th { vertical-align: top; text-align: left; padding: 0 8px 0 0; }
.ap-fipi td:last-child, .ap-fipi th:last-child { padding-right: 0; }
.ap-fipi table.t { margin: 11px 0; border: 1px solid var(--line); border-radius: 6px; }
.ap-fipi table.t td, .ap-fipi table.t th { border: 1px solid var(--line2); padding: 5px 9px; }
.ap-fipi table.t tr:first-child td { background: var(--neutralBg); font-weight: 600; }
.ap-fipi img {
  display: block; max-width: 100%; height: auto; margin: 10px 0;
  background: #fff; border: 1px solid var(--line2); border-radius: 8px; padding: 6px;
}
.ap-fipi b, .ap-fipi strong { font-weight: 600; }
.ap-fipi sub, .ap-fipi sup { font-size: 0.75em; line-height: 0; }
.ap-fipi u { text-underline-offset: 3px; }
.ap-fipi math { font-size: 1.05em; }
/* Два столбца задания на соответствие: при сборке набора они переписаны из
   таблицы в колонки, каждая со своей шапкой. На широком экране стоят рядом,
   на телефоне — друг под другом, и шапка остаётся при своём списке. */
.ap-fipi .cols { display: flex; gap: 28px; align-items: flex-start; margin: 10px 0; }
.ap-fipi .col { flex: 1 1 0; min-width: 0; }
.ap-fipi .col > b { display: block; margin-bottom: 8px; }
/* На телефоне широкая таблица с данными прокручивается сама, а не растягивает карточку. */
@media (max-width: 700px) {
  .ap-fipi { font-size: 14.5px; }
  .ap-fipi table.t { display: block; overflow-x: auto; }
  .ap-fipi .cols { display: block; }
  .ap-fipi .col + .col { margin-top: 16px; }
}

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
// границы можно поменять в разделе «Настройки».
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
