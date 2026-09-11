// Слияние — самая рискованная часть приложения: ошибка здесь молча теряет
// конспекты. Запуск: npm test
import { stampState, mergeStates } from "../src/sync-state.js";

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log("✗ " + name + "\n   получили: " + JSON.stringify(actual) + "\n   ожидали:  " + JSON.stringify(expected)); }
  else console.log("✓ " + name);
}

const T0 = 1000, T1 = 2000, T2 = 3000;

// Исходное общее состояние на обоих устройствах.
const base = stampState(null, {
  journal: [{ id: 1, note: "Право", hours: 1 }],
  events: [{ id: "e1", name: "Пробник", date: "2026-12-01", priority: 2 }],
  homework: [{ id: "h1", text: "Параграф 12", done: false }],
  data: { law: { topics: [{ id: "law-0", name: "ТГП", done: false, notes: [] }], custom: [] } },
  notebooks: { "subj:law": [{ id: "b1", title: "Блок", branches: [{ id: "r1", title: "Ветка", html: "<p>раз</p>" }] }] },
  budget: { alloc: { law: 4 } },
  openSections: { kpv: true },
}, T0);

// Телефон офлайн: пишет конспект и добавляет запись в дневник.
const phone = stampState(base, {
  ...base,
  journal: [...base.journal, { id: 2, note: "Экономика", hours: 2 }],
  notebooks: { "subj:law": [{ ...base.notebooks["subj:law"][0], branches: [{ id: "r1", title: "Ветка", html: "<p>раз и два</p>" }] }] },
  openSections: { kpv: false, journal: true },
}, T1);

// Ноутбук онлайн: правит расписание и отмечает урок пройденным.
const laptop = stampState(base, {
  ...base,
  data: { law: { topics: [{ id: "law-0", name: "ТГП", done: true, notes: [] }], custom: [] } },
  events: [...base.events, { id: "e2", name: "Региональный этап", date: "2027-01-20", priority: 3 }],
}, T2);

const merged = mergeStates(phone, laptop);

check("запись телефона сохранилась", merged.journal.map((e) => e.id), [1, 2]);
check("событие с ноутбука подхватилось", merged.events.map((e) => e.id), ["e1", "e2"]);
check("отметка «пройдено» с ноутбука", merged.data.law.topics[0].done, true);
check("конспект с телефона не затёрт", merged.notebooks["subj:law"][0].branches[0].html, "<p>раз и два</p>");
check("настройки интерфейса свои", merged.openSections, { kpv: false, journal: true });

// Удаление на одном устройстве не воскресает со второго.
const phoneDeleted = stampState(phone, { ...phone, homework: [] }, T2);
const mergedAfterDelete = mergeStates(phoneDeleted, laptop);
check("удалённое домашнее задание не вернулось", mergedAfterDelete.homework, []);

// Но правка элемента позже удаления его сохраняет.
const laptopEditedLater = stampState(laptop, {
  ...laptop,
  homework: [{ id: "h1", text: "Параграф 12 и 13", done: false }],
}, T2 + 5000);
const mergedConflict = mergeStates(phoneDeleted, laptopEditedLater);
check("правка позже удаления побеждает", mergedConflict.homework.map((h) => h.text), ["Параграф 12 и 13"]);

// Скаляры: бюджет, изменённый позже, побеждает.
const phoneBudget = stampState(phone, { ...phone, budget: { alloc: { law: 6 } } }, T2 + 9000);
const mergedBudget = mergeStates(phoneBudget, laptop);
check("более поздний бюджет побеждает", mergedBudget.budget, { alloc: { law: 6 } });

// Слияние должно быть симметричным по содержимому.
const reversed = mergeStates(laptop, phone);
check("порядок сторон не меняет данные", reversed.journal.map((e) => e.id).sort(), [1, 2]);

console.log(failures ? `\nПРОВАЛЕНО ПРОВЕРОК: ${failures}` : "\nвсе проверки прошли");
process.exit(failures ? 1 : 0);
