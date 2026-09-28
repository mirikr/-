import assert from "node:assert";
import { buildSchedule, SLOTS, BELLS, VARIANTS, SPECS, tierOfOption, peChoice, togglePeCell, peSummary } from "../src/lyceum-schedule-10.js";
import { moveHomework } from "../src/schedule-switch.js";

// Сетка с 28 сентября 2026 (таблица «по кабинетам»). Каждое утверждение ниже
// сверено с таблицей: если лицей поменяет сетку, правится SLOTS и эти числа.
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("✓ " + name);
}

const mathStudent = {
  school: "math",
  groups: { eng: "ivanova", alg: "grankina", geom: "mikhailova", rus: "pobortseva", pe: "g2m" },
  tiers: { eng: "base", math: "prof" },
  specs: [],
};

const at = (list, day, start) => list.filter((e) => e.day === day && e.start === start);

check("в одной клетке — один урок, кроме трека или физкультуры рядом", () => {
  const list = buildSchedule({ ...mathStudent, specs: ["lit", "phys"] });
  const cells = new Map();
  list.forEach((e) => cells.set(e.day + "#" + e.start, [...(cells.get(e.day + "#" + e.start) || []), e]));
  [...cells.entries()].forEach(([key, items]) => {
    if (items.length < 2) return;
    // Вместе стоят только олимпиадные треки и физкультура — она идёт рядом с ними.
    const ok = items.every((e) => e.level === "olymp" || e.level === "outside" || e.subjectName === "Физическая культура") ||
      items.filter((e) => e.level !== "olymp" && e.level !== "outside").length === 1;
    assert.ok(ok, key + ": " + items.map((e) => e.subjectName).join(", "));
  });
});

check("школьный предмет перебивает общий", () => {
  const math = buildSchedule(mathStudent);
  const law = buildSchedule({ school: "law", groups: { eng: "ivanova", rus: "timoshkova", math: "andropova" }, tiers: { math: "base" }, specs: [] });
  // Среда, 3 урок: у математиков алгебра, у юристов история.
  assert.deepEqual(at(math, "wed", "10:20").map((e) => e.subjectName), ["Алгебра"]);
  assert.deepEqual(at(law, "wed", "10:20").map((e) => e.subjectName), ["История"]);
  // Среда, 4 урок: базовая математика у юристов.
  assert.deepEqual(at(law, "wed", "11:20").map((e) => e.subjectName), ["Математика"]);
  // Понедельник, 2 урок: геометрия у математиков, история у юристов.
  assert.deepEqual(at(math, "mon", "09:25").map((e) => e.subjectName), ["Геометрия"]);
  assert.deepEqual(at(law, "mon", "09:25").map((e) => e.subjectName), ["История"]);
  // Понедельник, 5 урок: биология у медиков, естественные науки у остальных.
  const med = buildSchedule({ school: "med", groups: {}, specs: [] });
  assert.deepEqual(at(med, "mon", "12:20").map((e) => e.subjectName), ["Биология"]);
  assert.deepEqual(at(law, "mon", "12:20").map((e) => e.subjectName), ["Естественные науки"]);
});

check("невыбранная группа не приносит чужих уроков", () => {
  const list = buildSchedule({ school: "hum", groups: {}, specs: [] });
  assert.equal(list.filter((e) => e.subjectName.startsWith("Английский")).length, 0);
  // Физкультура теперь по группам: без выбора группы её нет.
  assert.equal(list.filter((e) => e.subjectName === "Физическая культура").length, 0);
  assert.ok(list.some((e) => e.subjectName === "Разговоры о важном"));
});

check("физкультура — по группе: два урока в свой день", () => {
  const pe = (g) => buildSchedule({ school: "hum", groups: { pe: g }, specs: [] }).filter((e) => e.subjectName === "Физическая культура");
  assert.deepEqual(pe("g2f").map((e) => e.day + " " + e.start + " " + e.teacher), ["wed 14:05 Сакович Е.С.", "wed 14:50 Сакович Е.С."]);
  assert.deepEqual(pe("g1m").map((e) => e.day + " " + e.teacher), ["tue Вовк В.С.", "tue Вовк В.С."]);
  assert.ok(pe("g4f").every((e) => e.day === "fri" && e.room === "Спортзал СОШ 47"));
  // Трек седьмым уроком физкультуру не вытесняет — оба встают рядом.
  const both = buildSchedule({ school: "hum", groups: { pe: "g1f" }, specs: ["lit"] });
  assert.deepEqual(at(both, "tue", "14:05").map((e) => e.subjectName).sort(), ["Литературный практикум: эссе, рецензии, тестовые задания", "Физическая культура"]);
});

check("физкультура днями: два дня по уроку или один день двумя уроками", () => {
  const pe = (choice) => buildSchedule({ school: "hum", groups: {}, specs: [], pe: choice }).filter((e) => e.subjectName === "Физическая культура");
  const two = pe({ at: ["tue#7", "thu#8"], group: "f" });
  assert.deepEqual(two.map((e) => e.day + " " + e.start + " " + e.teacher).sort(), ["thu 14:50 Дьяченко Д.Д.", "tue 14:05 Лайша А.О."]);
  const one = pe({ at: ["wed#7", "wed#8"], group: "m" });
  assert.deepEqual(one.map((e) => e.day + " " + e.start + " " + e.teacher), ["wed 14:05 Вовк В.С.", "wed 14:50 Вовк В.С."]);
  // Без группы — урок на месте, просто без преподавателя.
  const nobody = pe({ at: ["fri#8"], group: "" });
  assert.equal(nobody.length, 1);
  assert.equal(nobody[0].teacher, "");
  assert.equal(nobody[0].room, "Спортзал СОШ 47");
  // Больше двух часов не бывает, даже если в записи оказалось больше.
  assert.equal(pe({ at: ["tue#7", "wed#7", "thu#7"], group: "f" }).length, 2);
  // Чужие клетки (понедельник, первый урок) — не физкультура.
  assert.equal(pe({ at: ["mon#7", "tue#1"], group: "f" }).length, 0);
});

check("физкультура: третья отметка снимает самую раннюю", () => {
  let pe = { at: [], group: "" };
  pe = togglePeCell(pe, "tue#7");
  pe = togglePeCell(pe, "tue#8");
  assert.equal(peSummary(pe), "один день, два урока");
  pe = togglePeCell(pe, "thu#7");
  assert.deepEqual(pe.at, ["tue#8", "thu#7"]);
  assert.equal(peSummary(pe), "два дня по уроку");
  pe = togglePeCell(pe, "thu#7");
  assert.deepEqual(pe.at, ["tue#8"]);
  assert.equal(peSummary(pe), "один урок в неделю");
});

check("прежний выбор группы физкультуры — те же уроки, что и раньше", () => {
  for (const g of ["g1f", "g1m", "g2f", "g2m", "g3f", "g3m", "g4f", "g4m"]) {
    const choice = peChoice({ groups: { pe: g } });
    assert.equal(choice.at.length, 2);
    assert.equal(choice.group, g[2]);
    const old = buildSchedule({ school: "hum", groups: { pe: g }, specs: [] });
    const now = buildSchedule({ school: "hum", groups: {}, specs: [], pe: choice });
    assert.deepEqual(old.map((e) => e.id), now.map((e) => e.id), g);
  }
  // Новая запись важнее прежней.
  assert.deepEqual(peChoice({ groups: { pe: "g1f" }, pe: { at: ["fri#7"], group: "m" } }).at, ["fri#7"]);
});

check("физкультуру перенесли на другой день — задание к ней переезжает", () => {
  const old = buildSchedule({ school: "hum", groups: { pe: "g1f" }, specs: [] });
  const next = buildSchedule({ school: "hum", groups: {}, specs: [], pe: { at: ["thu#7", "thu#8"], group: "f" } });
  const tueLesson = old.find((e) => e.subjectName === "Физическая культура" && e.day === "tue");
  // Понедельник 28.09.2026: задание на вторник 29.09 → четверг 01.10.
  const hw = [{ id: "h1", lessonId: tueLesson.id, date: "2026-09-29", text: "форма" }];
  const { homework, moves } = moveHomework(hw, old, next, "2026-09-28");
  const target = next.find((e) => e.id === homework[0].lessonId);
  assert.ok(target && target.day === "thu" && target.subjectName === "Физическая культура");
  assert.equal(homework[0].date, "2026-10-01");
  assert.equal(moves.length, 1);
});

check("треки приходят только к тем, кто их отметил", () => {
  const without = buildSchedule({ ...mathStudent, specs: [] });
  assert.equal(without.filter((e) => e.day === "sat").length, 0);
  const chem = buildSchedule({ ...mathStudent, specs: ["chem"] });
  const sat = chem.filter((e) => e.day === "sat");
  // Химический практикум в ЮФУ, 2–6 уроки (5–6 — количественный анализ для 3–4 курса).
  assert.equal(sat.length, 5);
  assert.ok(sat.every((e) => e.level === "outside"));
  assert.ok(!sat.some((e) => /качественный/.test(e.subjectName)), "практикум 1–2 курса не приходит");
});

check("трек в основные часы встаёт рядом с уроком, а не вместо", () => {
  // Среда, 1 урок: «Математические методы в физике» у физиков — и обществознание.
  const list = buildSchedule({ school: "law", groups: {}, specs: ["phys"] });
  assert.deepEqual(at(list, "wed", "08:30").map((e) => e.subjectName).sort(), ["Математические методы в физике", "Обществознание"]);
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
    [].concat(slot.who.spec || []).forEach((id) => assert.ok(SPECS.some((s) => s.id === id), "нет трека " + id));
    // Физкультура выбирается днями, а не из списка групп: клетка — вт–пт, 7–8 урок.
    if (slot.who.v === "pe") {
      assert.ok(["tue", "wed", "thu", "fri"].includes(slot.day) && [7, 8].includes(slot.n), "физкультура " + slot.day + " " + slot.n);
      assert.ok(/^g[1-4][fm]$/.test(slot.who.o));
    } else if (slot.who.v) {
      const v = VARIANTS.find((x) => x.id === slot.who.v);
      assert.ok(v && v.options.some((o) => o.id === slot.who.o), slot.who.v + "/" + slot.who.o);
    }
  });
});

check("английский: база и профиль различаются уровнем и числом уроков", () => {
  const eng = VARIANTS.find((v) => v.id === "eng");
  assert.equal(tierOfOption(eng, "ivanova"), "base");
  assert.equal(tierOfOption(eng, "yazykova"), "prof");
  const only = (school, g) =>
    buildSchedule({ school, groups: { eng: g }, specs: [] }).filter((e) => e.subjectName.startsWith("Англ"));
  // База — понедельник и пятница шестым; у права и бизнеса в понедельник
  // шестым своё обществознание. Профиль — четверг 4–5 и пятница 5–6.
  assert.equal(only("hum", "ivanova").length, 2);
  assert.equal(only("law", "ivanova").length, 1);
  assert.equal(only("hum", "yazykova").length, 4);
  assert.ok(only("hum", "ivanova").every((e) => e.level === "base"));
  assert.ok(only("hum", "yazykova").every((e) => e.level === "prof"));
});

check("общая пара идёт обоим трекам и не задваивается", () => {
  const names = (specs) => buildSchedule({ school: "biz", groups: {}, specs }).map((e) => e.subjectName);
  const econ = names(["econ"]);
  const soc = names(["soc"]);
  const both = names(["econ", "soc"]);
  assert.equal(soc.filter((n) => n === "Финансовая грамотность").length, 2);
  assert.equal(econ.filter((n) => n === "Финансовая грамотность").length, 2);
  assert.equal(both.filter((n) => n === "Финансовая грамотность").length, 2);
  assert.ok(econ.includes("Экономический практикум"));
  assert.ok(!soc.includes("Экономический практикум"));
  // У обществоведов — новые занятия трека.
  ["Социология", "Право", "Политология", "Человек, общество и познание"].forEach((n) => assert.ok(soc.includes(n), n));
});

check("математика: базовая у одного преподавателя, профильная по группам", () => {
  const base = buildSchedule({ school: "biz", groups: { math: "andropova" }, tiers: { math: "base" }, specs: [] }).map((e) => e.subjectName);
  assert.equal(base.filter((n) => n === "Математика").length, 2);
  assert.ok(!base.includes("Алгебра") && !base.includes("Геометрия"));
  const prof = buildSchedule({ school: "biz", groups: { alg: "myakotina", geom: "mikhailova" }, tiers: { math: "prof" }, specs: [] }).map((e) => e.subjectName);
  assert.ok(!prof.includes("Математика"));
  assert.equal(prof.filter((n) => n === "Алгебра").length, 4);
  assert.equal(prof.filter((n) => n === "Геометрия").length, 2);
});

check("вероятность и статистика — по уровню математики", () => {
  const vs = (choices) => buildSchedule(choices).filter((e) => e.subjectName === "Вероятность и статистика").map((e) => e.teacher);
  assert.deepEqual(vs({ school: "biz", groups: { alg: "myakotina" }, tiers: { math: "prof" }, specs: [] }), ["Победоносцева Е.А."]);
  assert.deepEqual(vs({ school: "biz", groups: { math: "andropova" }, tiers: { math: "base" }, specs: [] }), ["Мякотина В.И."]);
  // Старые записи без уровня: алгебра выбрана — значит профильная.
  assert.deepEqual(vs({ school: "biz", groups: { alg: "myakotina" }, specs: [] }), ["Победоносцева Е.А."]);
  assert.deepEqual(vs({ school: "law", groups: {}, specs: [] }), ["Мякотина В.И."]);
});

// «Основы ИИ» не спрашиваются отдельно: группу определяет академическая школа.
check("группа по основам ИИ берётся из школы, а не из выбора", () => {
  assert.ok(!VARIANTS.some((v) => v.id === "ai"), "варианта «Основы ИИ» в выборе быть не должно");
  const ai = (school) =>
    buildSchedule({ school, groups: {}, specs: [] })
      .filter((e) => e.subjectName.startsWith("Основы ИИ"))
      .map((e) => e.day + " " + e.start + " " + e.subjectName + " · " + e.teacher);
  assert.deepStrictEqual(ai("math"), ["thu 09:25 Основы ИИ (гр. 2) · Лебедев А.И."]);
  assert.deepStrictEqual(ai("med"), ["thu 09:25 Основы ИИ (гр. 2) · Лебедев А.И."]);
  assert.deepStrictEqual(ai("biz"), ["thu 10:20 Основы ИИ (гр. 1) · Лебедев А.И."]);
  assert.deepStrictEqual(ai("hum"), ["thu 10:20 Основы ИИ (гр. 1) · Лебедев А.И."]);
  assert.deepStrictEqual(ai("law"), ["thu 10:20 Основы ИИ (гр. 3) · Датенко В.И."]);
});

check("логика — урок школы права", () => {
  const law = buildSchedule({ school: "law", groups: {}, specs: [] });
  assert.deepEqual(at(law, "tue", "12:20").map((e) => e.subjectName + " · " + e.teacher), ["Логика · Павленко О.Н."]);
  assert.ok(!buildSchedule({ school: "biz", groups: {}, specs: [] }).some((e) => e.subjectName === "Логика"));
});

console.log("\nвсе проверки расписания прошли (" + passed + ")");
