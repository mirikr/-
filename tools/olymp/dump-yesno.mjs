// Суждения «верно — неверно» из тестов ВсОШ — для блица в учебнике.
//   node tools/olymp/dump-yesno.mjs
import { writeFileSync } from "node:fs";
import { OLYMPIADS } from "../../src/vosh/vosh-society.js";
const out = [];
for (const o of OLYMPIADS) for (const t of o.tasks) if (t.kind === "yesno") t.items.forEach((text, i) => out.push({ t: text, ok: !!t.answer[i], src: o.stageName + ", " + o.grade + " класс, " + o.year }));
writeFileSync(new URL("./yesno.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(out.length, "суждений");
