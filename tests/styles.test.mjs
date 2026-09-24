// Повторный ключ в объекте стилей не ломает сборку — выигрывает последний, и
// какой-то элемент молча получает чужой стиль. Так карточка напоминания на
// «Сегодня» годами жила с отступом от напоминания у домашки, а колонка
// значков в «Ближайших событиях» — со стилем подписи «сегодня».
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
let bad = 0;
let objects = 0;

for (const file of readdirSync(SRC).filter((f) => /\.jsx?$/.test(f))) {
  const lines = readFileSync(join(SRC, file), "utf8").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const open = lines[i].match(/^const ([A-Za-z]+) = \{$/);
    if (!open) continue;
    objects += 1;
    const seen = new Map();
    for (let j = i + 1; j < lines.length && lines[j] !== "};"; j += 1) {
      const key = (lines[j].match(/^  ([A-Za-z0-9_]+):/) || [])[1];
      if (!key) continue;
      if (seen.has(key)) {
        bad += 1;
        console.log(`✗ ${file}: в ${open[1]} ключ «${key}» дважды — строки ${seen.get(key)} и ${j + 1}`);
      } else {
        seen.set(key, j + 1);
      }
    }
  }
}

if (bad) {
  console.log(`\nповторов: ${bad}`);
  process.exit(1);
}
console.log(`✓ в объектах стилей нет повторных ключей (объектов: ${objects})`);
