// Учебники и планы. Каждый — страница в public/ (собирается
// tools/olymp/build-page.py); новый учебник — ещё одна запись здесь.
// subjects — к какому предмету «Подготовки» отнести время чтения раздела:
// ключ — раздел учебника, значение — название предмета (ищется по имени,
// у встроенных предметов и у своих одинаково).
export const BOOKS = [
  {
    id: "society-mun-2026",
    title: "Обществознание · муниципальный этап",
    note: "план до 19 ноября 2026, формат этапа, 14 разделов теории, тесты и тренировки",
    src: "olymp/index.html",
    subjects: {
      law: "Право", constitution: "Право", theory: "Право",
      economics: "Экономика", econdeep: "Экономика",
      politics: "Политология", countries: "Политология",
      sociology: "Социология",
      society: "Философия", culture: "Философия", logic: "Философия", persons: "Философия",
    },
  },
];

// План подготовки по дням — тот же файл, из которого собирается учебник.
import plan from "../tools/olymp/plan.json";
export const BOOK_PLAN = plan;

const pad = (n) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};

// Что сделано по плану, учебник хранит у себя (тот же сайт — то же хранилище).
export function planDone() {
  try {
    return JSON.parse(localStorage.getItem("olymp-plan-done") || "{}");
  } catch (e) {
    return {};
  }
}

// План на сегодня: день из плана и сколько пунктов в нём закрыто.
export function planToday() {
  const day = BOOK_PLAN.days.find((d) => d.date === todayKey());
  if (!day) return null;
  const done = planDone();
  const closed = day.items.filter((_, i) => done[day.date + ":" + i]).length;
  return { ...day, closed, book: BOOK_PLAN.book, event: BOOK_PLAN.event };
}
