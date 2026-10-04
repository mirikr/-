import { decryptFeed, recipientCode } from "./results-feed.js";
import { fetchInbox } from "./results-inbox.js";
import { expandResults, gradeOf, kindName, percentOfGrade, scoreColor, scoreTone, summarize } from "./results-model.js";
import FEED from "./results-feed.json";
import DEMO_FEED from "./results-demo-feed.json";

// Данные «Результатов» для всего приложения: выложенное ученику (обновлением и
// учителем) и метки дней для дневника. Модуль грузится отдельно и только там,
// где раздел включён, — на сайте его нет, пока раздел в разработке.

export const DEMO_EMAIL = "student@demo";
export const DEMO_ACCOUNT = "sandbox-demo";
export const HIDDEN_KEY = "planner-results-hidden";

export function readHidden() {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

// Код аккаунта и выложенное ему.
export async function loadPublished({ sandbox, accountId, accountEmail }) {
  const id = sandbox ? DEMO_ACCOUNT : accountId;
  const code = id ? await recipientCode(id) : "";
  const fromFeed = code ? await decryptFeed(sandbox ? DEMO_FEED : FEED, code) : [];
  const fromTeacher = sandbox || accountEmail ? await fetchInbox(DEMO_EMAIL) : [];
  return { code, items: [...fromTeacher, ...fromFeed] };
}

// Результаты по дням: { "2026-10-05": [{ id, subject, title, kind, label, percent, grade }] }.
// Скрытые у себя официальные не показываем; этапы олимпиады — по своим датам.
export function dayMarks(own, published, hiddenIds) {
  const hidden = new Set(hiddenIds || []);
  const all = [...(own || []).map((r) => ({ ...r, source: "self" })), ...(published || []).filter((r) => !hidden.has(r.id))];
  const out = {};
  expandResults(all).forEach((r) => {
    const date = String(r.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let label;
    let percent = null;
    let grade = null;
    if (r.scale === "absent") label = "н";
    else {
      const s = summarize(r);
      percent = s.percent;
      grade = r.kind === "olympiad" ? null : gradeOf(r);
      if (grade !== null) label = String(grade);
      else if (percent !== null) label = String(Math.round(percent));
      else return;
    }
    (out[date] = out[date] || []).push({
      id: r.id + (r.stageName ? ":" + r.stageName : ""),
      subject: r.subject || "",
      title: r.title || kindName(r.kind),
      kind: r.kind,
      kindName: kindName(r.kind),
      label,
      percent,
      grade,
      official: r.source !== "self",
    });
  });
  return out;
}

// Метка дня в календаре: первая отметка (её цвет — по баллу) и сколько ещё.
export function daySummary(list) {
  if (!list || !list.length) return null;
  const marks = list.filter((m) => m.label !== "н");
  const first = marks[0] || list[0];
  return { label: first.label, percent: first.percent, more: list.length - 1 };
}

export { percentOfGrade, scoreColor, scoreTone };
