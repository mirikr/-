import { useEffect, useState } from "react";

// Палитра приложения в двух видах. Раньше цвета стояли прямо в стилях, и ночной
// темы быть не могло: чтобы перекрасить приложение, пришлось бы переписать
// каждую строку. Теперь цвет называется по смыслу — «фон», «линия», «текст
// послабее» — а какой он на самом деле, решает атрибут data-theme на обёртке.
export const THEME_CSS = `
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
  --shadow:0 10px 26px rgba(0,0,0,.4);
  color-scheme:dark;
}
`;

const MODE_KEY = "planner-theme-mode";
// Вечер начинается в 20:00 и заканчивается в 7 утра — это про то, когда за
// ежедневником сидят при выключенном свете, а не про астрономию.
export const NIGHT_FROM = 20;
export const NIGHT_TO = 7;

export function isNightHour(hour) {
  return NIGHT_FROM > NIGHT_TO ? hour >= NIGHT_FROM || hour < NIGHT_TO : hour >= NIGHT_FROM && hour < NIGHT_TO;
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

  const theme = mode === "auto" ? (isNightHour(hour) ? "night" : "light") : mode;

  // Атрибут ставится на <html>, а не только на обёртку приложения: иначе фон
  // страницы за её пределами остаётся светлым, а панель входа — без палитры.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return { mode, setMode, theme, night: theme === "night" };
}
