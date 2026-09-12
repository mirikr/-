// Рисует иконки приложения из одного SVG и раскладывает их в public/.
// Запуск: node scripts/make-icons.mjs
// (нужен playwright и Chromium; путь к ним — PLAYWRIGHT_MODULE и CHROMIUM_PATH)
//
// Сюжет иконки — кривая производственных возможностей из экономики: столько же,
// сколько приложение считает часов. По осям время, дугой — предел возможного,
// прямая — выбранный темп, точка — где они сходятся. Столбиковая диаграмма,
// стоявшая тут раньше, к теме отношения не имела.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Playwright ставится глобально не везде одинаково, поэтому путь к нему можно
// подсказать переменной PLAYWRIGHT_MODULE.
const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;

const OUT = resolve(process.cwd(), "public");
const BROWSER = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const COLORS = {
  bg: "#EFEBE1",
  ink: "#2B2822",
  curve: "#8C7326",
  line: "#2F4E70",
  dot: "#B23A3A",
};

// Кривая и прямая заданы так, чтобы пересекаться примерно посередине холста.
const CURVE = { from: [104, 158], c1: [258, 172], c2: [320, 258], to: [378, 424] };
const LINE = { from: [128, 424], to: [344, 126] };

function bezier(t) {
  const p = [CURVE.from, CURVE.c1, CURVE.c2, CURVE.to];
  const u = 1 - t;
  return [0, 1].map(
    (i) => u ** 3 * p[0][i] + 3 * u ** 2 * t * p[1][i] + 3 * u * t ** 2 * p[2][i] + t ** 3 * p[3][i]
  );
}

// Точку пересечения ищем перебором: аналитически решать кубическое уравнение
// ради одной картинки незачем.
function intersection() {
  const [ax, ay] = LINE.from;
  const [bx, by] = LINE.to;
  let best = null;
  for (let i = 0; i <= 2000; i++) {
    const [x, y] = bezier(i / 2000);
    const d = Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / Math.hypot(by - ay, bx - ax);
    if (!best || d < best.d) best = { d, x, y };
  }
  return best;
}

function svg({ padding }) {
  const p = intersection();
  const scale = (512 - padding * 2) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${COLORS.bg}"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <g stroke="${COLORS.ink}" stroke-width="15" stroke-linecap="round" fill="none">
      <path d="M96 428 L96 116"/>
      <path d="M96 428 L400 428"/>
    </g>
    <g fill="${COLORS.ink}">
      <path d="M96 86 L114 126 L78 126 Z"/>
      <path d="M430 428 L390 446 L390 410 Z"/>
    </g>
    <path d="M${CURVE.from} C${CURVE.c1} ${CURVE.c2} ${CURVE.to}"
          fill="none" stroke="${COLORS.curve}" stroke-width="24" stroke-linecap="round"/>
    <path d="M${LINE.from} L${LINE.to}"
          fill="none" stroke="${COLORS.line}" stroke-width="15" stroke-linecap="round"/>
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="27" fill="${COLORS.bg}"/>
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="17" fill="${COLORS.dot}"/>
  </g>
</svg>`;
}

const TARGETS = [
  { file: "icon-512.png", size: 512, padding: 0 },
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "apple-touch-icon.png", size: 180, padding: 0 },
  // Маскируемая иконка обрезается системой по кругу, поэтому рисунок ужат внутрь.
  { file: "maskable-512.png", size: 512, padding: 64 },
];

const browser = await chromium.launch({ executablePath: BROWSER });
mkdirSync(OUT, { recursive: true });

for (const t of TARGETS) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
  const markup = svg({ padding: t.padding }).replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`);
  await page.setContent(`<body style="margin:0">${markup}</body>`);
  await page.screenshot({ path: resolve(OUT, t.file), omitBackground: false });
  await page.close();
  console.log("нарисовано", t.file, t.size + "px");
}

await browser.close();
