// Рисует иконки приложения и раскладывает их в public/.
// Запуск: node scripts/make-icons.mjs
// (нужен playwright и Chromium; путь к ним — PLAYWRIGHT_MODULE и CHROMIUM_PATH)
//
// Сюжет — клетка дня из дневника: квадрат, залитый снизу на долю выполненной
// дневной цели, и красная метка в углу — день экзамена. Приложение ровно это и
// делает, поэтому иконка показывает его работу, а не абстракцию.
//
// Прежний рисунок — оси, кривая возможностей и точка выбора — на домашнем
// экране не читался: тонкие линии и поля по краям превращали его в пятно.
// Здесь всего три формы, и каждая переживает уменьшение до 60 пикселей.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Playwright ставится глобально не везде одинаково, поэтому путь к нему можно
// подсказать переменной PLAYWRIGHT_MODULE.
const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;

const OUT = resolve(process.cwd(), "public");
const BROWSER = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PALETTE = {
  light: { bg: "#EFEBE1", ink: "#2B2822", gold: "#C9A227", edge: "#8C7326", red: "#B23A3A" },
  dark: { bg: "#171612", ink: "#EDE7D8", gold: "#E8C468", edge: "#C9A227", red: "#C96A60" },
};

function svg(theme, size, padding) {
  const c = PALETTE[theme];
  const scale = (512 - padding * 2) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <rect width="512" height="512" fill="${c.bg}"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <rect x="104" y="104" width="304" height="304" rx="56" fill="${c.bg}" stroke="${c.ink}" stroke-width="30"/>
    <path d="M134 268 L134 352 a30 30 0 0 0 30 30 l184 0 a30 30 0 0 0 30 -30 l0 -84 Z" fill="${c.gold}"/>
    <path d="M134 268 L378 268" stroke="${c.edge}" stroke-width="10"/>
    <circle cx="386" cy="126" r="46" fill="${c.bg}"/>
    <circle cx="386" cy="126" r="30" fill="${c.red}"/>
  </g>
</svg>`;
}

// Иконку на домашнем экране система по теме не переключает — она запоминается
// при установке. Поэтому основная одна, тёмная; светлая лежит рядом и идёт в
// favicon вкладки, где тема как раз меняется.
const TARGETS = [
  { file: "icon-512.png", size: 512, padding: 0, theme: "dark" },
  { file: "icon-192.png", size: 192, padding: 0, theme: "dark" },
  { file: "apple-touch-icon.png", size: 180, padding: 0, theme: "dark" },
  // Маскируемая иконка обрезается системой по кругу, поэтому рисунок ужат внутрь.
  { file: "maskable-512.png", size: 512, padding: 64, theme: "dark" },
  { file: "icon-light-512.png", size: 512, padding: 0, theme: "light" },
  { file: "icon-light-192.png", size: 192, padding: 0, theme: "light" },
];

const browser = await chromium.launch({ executablePath: BROWSER });
mkdirSync(OUT, { recursive: true });

for (const t of TARGETS) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
  await page.setContent(`<body style="margin:0">${svg(t.theme, t.size, t.padding)}</body>`);
  await page.screenshot({ path: resolve(OUT, t.file), omitBackground: false });
  await page.close();
  console.log("нарисовано", t.file, t.size + "px", t.theme);
}

await browser.close();
