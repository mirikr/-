import assert from "node:assert";
import { buildSchedule, SLOTS, BELLS, VARIANTS, tierOfOption } from "../src/lyceum-schedule-10.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const mathStudent = {
  school: "math",
  groups: { eng: "yazykova", alg: "grankina", geom: "mikhailova", rus: "pobortseva", ai: "g1" },
  specs: ["econsoc", "lawschool"],
};

const at = (list, day, start) => list.filter((e) => e.day === day && e.start === start);

check("в одной клетке остаётся один урок", () => {
  const list = buildSchedule(mathStudent);
  const cells = new Map();
  list.forEach((e) => {
    const key = e.day + "#" + e.start;
    cells.set(key, (cells.get(key) || 0) + 1);
  });
  // Больше одного урока в клетке допустимо только для двух выбранных спецкурсов.
  [...cells.entries()].forEach(([key, count]) => {
    if (count > 1) assert.ok(at(list, key.split("#")[0], key.split("#")[1]).every((e) => e.level !== "base"), key);
  });
});

check("школьный предмет перебивает общий", () => {
  const math = buildSchedule(mathStudent);
  // Среда, 1 урок: у математиков алгебра, а «Математика» — у остальных школ.
  assert.deepEqual(at(math, "wed", "08:30").map((e) => e.subjectName), ["Алгебра"]);
  const law = buildSchedule({ school: "law", groups: { eng: "ivanova", rus: "timoshkova" }, specs: [] });
  assert.deepEqual(at(law, "wed", "08:30").map((e) => e.subjectName), ["Математика"]);
  // Пятый урок понедельника: геометрия у математиков, история у юристов.
  assert.deepEqual(at(law, "mon", "12:20").map((e) => e.subjectName), ["История"]);
});

check("невыбранная группа не приносит чужих уроков", () => {
  const list = buildSchedule({ school: "hum", groups: {}, specs: [] });
  assert.equal(list.filter((e) => e.subjectName.startsWith("Английский")).length, 0);
  // Физкультура выбора не требует — её ведут оба преподавателя, она приходит всем.
  assert.equal(list.filter((e) => e.subjectName === "Физическая культура").length, 2);
  // Общие уроки тоже остаются.
  assert.ok(list.some((e) => e.subjectName === "Разговоры о важном"));
});

check("спецкурсы приходят только к тем, кто их отметил", () => {
  const without = buildSchedule({ ...mathStudent, specs: [] });
  assert.equal(without.filter((e) => e.day === "sat").length, 0);
  const chem = buildSchedule({ ...mathStudent, specs: ["chem"] });
  const sat = chem.filter((e) => e.day === "sat");
  assert.equal(sat.length, 5);
  // Выезд в ЮФУ и онлайн — уроки вне лицея.
  assert.ok(sat.every((e) => e.level === "outside"));
});

check("уроки встают по звонкам и помечены набором", () => {
  const list = buildSchedule(mathStudent);
  const times = new Set(Object.values(BELLS).map((b) => b[0]));
  assert.ok(list.every((e) => times.has(e.start)));
  assert.ok(list.every((e) => e.preset === "lyceum10" && e.kind === "lesson"));
  assert.equal(new Set(list.map((e) => e.id)).size, list.length);
});

check("у каждой строки сетки есть звонок и кому она адресована", () => {
  SLOTS.forEach((slot) => {
    assert.ok(BELLS[slot.n], `нет звонка для ${slot.day} ${slot.n}`);
    assert.ok(slot.subject && slot.teacher && slot.room, `${slot.day} ${slot.n}`);
  });
});

check("английский: у базы два урока в неделю, у профиля четыре", () => {
  const eng = VARIANTS.find((v) => v.id === "eng");
  assert.equal(tierOfOption(eng, "ivanova"), "base");
  assert.equal(tierOfOption(eng, "yazykova"), "prof");
  const only = (g) => buildSchedule({ school: "hum", groups: { eng: g }, specs: [] }).filter((e) => e.subjectName.startsWith("Англ"));
  const base = only("ivanova");
  const prof = only("yazykova");
  assert.equal(base.length, 2);
  assert.equal(prof.length, 4);
  assert.ok(base.every((e) => e.level === "base"));
  assert.ok(prof.every((e) => e.level === "prof"));
});

check("общая пара идёт обоим спецкурсам и не задваивается", () => {
  const names = (specs) => buildSchedule({ school: "biz", groups: {}, specs }).map((e) => e.subjectName);
  const econ = names(["econ"]);
  const soc = names(["soc"]);
  const both = names(["econ", "soc"]);
  // Финансовая грамотность — общая пара экономистов и обществоведов.
  assert.equal(soc.filter((n) => n === "Финансовая грамотность").length, 2);
  assert.equal(econ.filter((n) => n === "Финансовая грамотность").length, 2);
  assert.equal(both.filter((n) => n === "Финансовая грамотность").length, 2);
  // Экономический практикум — только у экономистов.
  assert.ok(econ.includes("Экономический практикум"));
  assert.ok(!soc.includes("Экономический практикум"));
});

console.log(`\nвсе проверки расписания прошли (${passed})`);
