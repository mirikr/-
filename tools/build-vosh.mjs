// Сборка тестовых заданий ВсОШ: tools/vosh/society/*.mjs → src/vosh/vosh-society.js
// и опись src/vosh-index.js.
//
// Задания переносятся из опубликованных «заданий и критериев» руками: текст
// склеивается из PDF, ключи записываются так же, как в критериях («2, 3, 4»,
// «А – 3, Б – 1»). Здесь они разбираются и сверяются: ключ ссылается только на
// существующие варианты, пунктов столько же, сколько ответов, картинки лежат в
// public/vosh. Любое расхождение останавливает сборку.
//
// Запуск: node tools/build-vosh.mjs
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "tools/vosh/society");
const STAGES = { school: "Школьный этап", municipal: "Муниципальный этап", regional: "Региональный этап", final: "Заключительный этап" };
const KINDS = ["yesno", "multi", "one", "match", "matchmany", "groups", "gaps", "short"];

let errors = 0;
const fail = (where, msg) => {
  errors += 1;
  console.error("✗ " + where + ": " + msg);
};

const splitKeys = (s) => String(s).split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

function checkPicture(where, src) {
  if (!/^vosh\/[a-z0-9-]+\.webp$/.test(src)) fail(where, "картинка подписана не так: " + src);
  else if (!existsSync(resolve(ROOT, "public", src))) fail(where, "нет файла картинки " + src);
}

function normalizeTask(o, t) {
  const where = o.id + " №" + t.no;
  if (!KINDS.includes(t.kind)) fail(where, "неизвестный тип " + t.kind);
  if (!t.q || t.q.length < 8) fail(where, "нет вопроса");
  if (t.ctx && !(o.contexts || {})[t.ctx]) fail(where, "нет контекста " + t.ctx);
  (t.pictures || []).forEach((p) => checkPicture(where, p.src));
  const out = { id: o.id + "-" + t.no, no: t.no, kind: t.kind, q: t.q.trim() };
  ["ctx", "pictures", "why", "note"].forEach((k) => t[k] && (out[k] = t[k]));
  const optKeys = (t.options || []).map((x) => x.k);
  (t.options || []).concat(t.items || []).forEach((x) => {
    if (typeof x === "string") return x.trim() || fail(where, "пустой пункт");
    if (x.img) checkPicture(where, x.img);
    else if (!x.t || !String(x.t).trim()) fail(where, "пустой вариант " + x.k);
  });
  if (new Set(optKeys).size !== optKeys.length) fail(where, "варианты повторяются");
  const per = t.per || 1;
  switch (t.kind) {
    case "yesno": {
      const a = splitKeys(t.answer).map((w) => (w === "да" ? true : w === "нет" ? false : fail(where, "в ключе не да/нет: " + w)));
      if (a.length !== t.items.length) fail(where, "пунктов " + t.items.length + ", ответов " + a.length);
      Object.assign(out, { items: t.items, answer: a, per, max: per * a.length });
      break;
    }
    case "multi": {
      const parse = (s) => {
        const keys = splitKeys(s);
        keys.forEach((k) => optKeys.includes(k) || fail(where, "в ключе нет варианта " + k));
        return keys;
      };
      const a = parse(t.answer);
      Object.assign(out, { options: t.options, answer: a, per, penalty: t.penalty || 0, max: per * a.length });
      if (t.limit) out.limit = t.limit;
      // «Штраф за каждый из лишних пунктов, превышающих количество пунктов в
      // верном ответе»: штрафуется не неверный выбор, а выбор сверх нужного числа.
      if (t.over) out.over = true;
      if (t.alt) out.alt = t.alt.map(parse);
      // «Точное совпадение — столько-то баллов»: без частичных баллов.
      if (t.exact) Object.assign(out, { exact: true, points: t.points || 1, max: t.points || 1 });
      else if (!t.penalty) fail(where, "у «выберите все» нет штрафа — отметить всё было бы выгодно");
      break;
    }
    case "one": {
      if (!optKeys.includes(t.answer)) fail(where, "в ключе нет варианта " + t.answer);
      Object.assign(out, { options: t.options, answer: t.answer, points: t.points || 1, max: t.points || 1 });
      break;
    }
    case "match": {
      // «7/1» — к позиции подходит любой из нескольких вариантов.
      const a = splitKeys(t.answer).map((k) => (k.includes("/") ? k.split("/") : k));
      if (a.length !== t.items.length) fail(where, "позиций " + t.items.length + ", ответов " + a.length);
      a.flat().forEach((k) => optKeys.includes(k) || fail(where, "в ключе нет варианта " + k));
      Object.assign(out, { items: t.items, options: t.options, answer: a, per, max: per * a.length });
      break;
    }
    case "matchmany": {
      const a = String(t.answer).split("|").map(splitKeys);
      if (a.length !== t.items.length) fail(where, "позиций " + t.items.length + ", ответов " + a.length);
      a.flat().forEach((k) => optKeys.includes(k) || fail(where, "в ключе нет варианта " + k));
      Object.assign(out, { items: t.items, options: t.options, answer: a, per, max: per * a.flat().length });
      break;
    }
    case "groups": {
      const parts = String(t.answer).split("|").map((g) => g.replace(/[\s,]/g, "").split(""));
      if (parts.length !== t.groups) fail(where, "групп " + t.groups + ", в ключе " + parts.length);
      const keys = t.items.map((it) => it.k);
      // Лишние изображения (t.extra) ни в одну группу не входят — у них 0.
      const a = keys.map((k) => {
        const g = parts.findIndex((p) => p.includes(k));
        if (g < 0 && !t.extra) fail(where, "позиция " + k + " не попала ни в одну группу");
        return g + 1;
      });
      const grouped = a.filter((g) => g > 0).length;
      if (parts.flat().length !== grouped) fail(where, "в ключе лишние или повторные позиции");
      if (t.extra && grouped === keys.length) fail(where, "отмечены лишние, но все позиции в группах");
      Object.assign(out, { items: t.items, groups: t.groups, answer: a, per, max: per * grouped });
      if (t.extra) out.extra = true;
      if (t.names) out.names = t.names;
      if (/К группе 1 относится/i.test(t.q) || t.names) out.fixed = true;
      break;
    }
    case "gaps": {
      const gaps = [...String(t.text).matchAll(/\(([А-ЯЁ])\)/g)].map((m) => m[1]);
      const a = splitKeys(t.answer);
      if (!gaps.length) fail(where, "в тексте нет пропусков (А)");
      if (a.length !== gaps.length) fail(where, "пропусков " + gaps.length + ", ответов " + a.length);
      a.forEach((k) => optKeys.includes(k) || fail(where, "в ключе нет варианта " + k));
      Object.assign(out, { text: t.text, gaps, options: t.options, answer: a, per, max: per * a.length });
      break;
    }
    case "short": {
      if (!String(t.answer || "").trim()) fail(where, "нет ответа");
      Object.assign(out, { answer: String(t.answer), points: t.points || 1, max: t.points || 1 });
      if (t.accept) out.accept = t.accept;
      if (t.unit) out.unit = t.unit;
      break;
    }
    default:
  }
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".mjs")).sort();
const olympiads = [];
for (const f of files) {
  const o = (await import(pathToFileURL(resolve(DIR, f)).href)).default;
  if (o.id + ".mjs" !== f) fail(f, "id не совпадает с именем файла: " + o.id);
  if (!STAGES[o.stage]) fail(o.id, "неизвестный этап " + o.stage);
  Object.entries(o.contexts || {}).forEach(([k, c]) => {
    (c.pictures || []).forEach((p) => checkPicture(o.id + " контекст " + k, p.src));
    if (!c.text && !(c.pictures || []).length && !c.table) fail(o.id, "пустой контекст " + k);
  });
  const tasks = o.tasks.map((t) => normalizeTask(o, t));
  const ids = tasks.map((t) => t.id);
  if (new Set(ids).size !== ids.length) fail(o.id, "номера заданий повторяются");
  const used = new Set(tasks.map((t) => t.ctx).filter(Boolean));
  Object.keys(o.contexts || {}).forEach((k) => used.has(k) || fail(o.id, "контекст " + k + " ни к чему не относится"));
  olympiads.push({
    id: o.id,
    subject: o.subject || "Обществознание",
    year: o.year,
    stage: o.stage,
    stageName: STAGES[o.stage],
    grade: o.grade,
    region: o.region || "",
    max: o.max,
    contexts: o.contexts || {},
    tasks,
  });
}

if (errors) {
  console.error("\n" + errors + " ошибок — набор не собран");
  process.exit(1);
}

// Порядок: сначала свежие годы, внутри года — этап и класс.
const stageOrder = Object.keys(STAGES);
olympiads.sort((a, b) => b.year.localeCompare(a.year) || stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || a.grade - b.grade);

const head = `// Тестовые задания ВсОШ по обществознанию — из опубликованных заданий и
// критериев оценивания, вместе с официальными ключами. Развёрнутые задания
// (эссе, объяснения, примеры) сюда не входят: их нельзя проверить автоматически.
//
// Файл собран tools/build-vosh.mjs из tools/vosh/society, руками его не правят.
`;
writeFileSync(resolve(ROOT, "src/vosh/vosh-society.js"), head + "export const OLYMPIADS = " + JSON.stringify(olympiads, null, 1) + ";\n");

const index = olympiads.map((o) => ({
  id: o.id,
  subject: o.subject,
  year: o.year,
  stage: o.stage,
  stageName: o.stageName,
  grade: o.grade,
  region: o.region,
  max: o.max,
  points: o.tasks.reduce((n, t) => n + t.max, 0),
  ids: o.tasks.map((t) => t.id),
}));
writeFileSync(
  resolve(ROOT, "src/vosh-index.js"),
  `// Опись тестов ВсОШ: какие олимпиады есть и номера их заданий. Весит копейки,
// поэтому лежит в приложении целиком: по ней считаются серия и часы, а сами
// задания грузятся, только когда раздел открыли.
//
// Файл собран tools/build-vosh.mjs, руками его не правят.
export const VOSH_INDEX = ${JSON.stringify(index, null, 1)};

export const VOSH_SUBJECTS = [{ name: "Обществознание", ids: VOSH_INDEX.flatMap((o) => o.ids) }];
`,
);

const total = olympiads.reduce((n, o) => n + o.tasks.length, 0);
console.log("✓ олимпиад: " + olympiads.length + ", заданий: " + total);
olympiads.forEach((o) => {
  const kinds = {};
  o.tasks.forEach((t) => (kinds[t.kind] = (kinds[t.kind] || 0) + 1));
  console.log("  " + o.id + " — " + o.tasks.length + " заданий, " + o.tasks.reduce((n, t) => n + t.max, 0) + " из " + o.max + " баллов · " + Object.entries(kinds).map(([k, n]) => k + " " + n).join(", "));
});
