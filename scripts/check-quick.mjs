// Быстрый набор перед выкладкой — для правок вида, текстов и расположения:
// юнит-тесты, сборка сайта, приложение открывается, нет белого экрана, раздел
// «Результаты» не попал в сборку сайта. Минуты три. Когда что использовать —
// см. CLAUDE.md, «Проверки перед выкладкой».
//
// Запуск: PLAYWRIGHT_MODULE=… npm run check:quick
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const run = (title, cmd, env = {}) => {
  process.stdout.write(title + " … ");
  try {
    execSync(cmd, { stdio: "pipe", env: { ...process.env, ...env } });
    console.log("ok");
    return true;
  } catch (e) {
    console.log("НЕ ПРОШЛО");
    console.log(String(e.stdout || "").split("\n").filter((l) => /✗|Error|FAIL|not ok/.test(l)).slice(0, 10).join("\n"));
    return false;
  }
};

let ok = true;
ok = run("юнит-тесты", "npm test") && ok;
ok = run("сборка сайта", "npx vite build", { BASE_PATH: "/-/" }) && ok;

// Раздел «Результаты» на сайте выключен: ни его куска, ни его строк в сборке.
const assets = readdirSync("dist/assets").filter((f) => f.endsWith(".js"));
const leaked = assets.filter((f) => /^results-/.test(f) || /Журналы класса|Как менялся балл/.test(readFileSync("dist/assets/" + f, "utf8")));
console.log("«Результаты» не в сборке сайта … " + (leaked.length ? "НЕ ПРОШЛО: " + leaked.join(", ") : "ok"));
if (leaked.length) ok = false;

ok = run("приложение открывается", "node scripts/check-render.mjs") && ok;
ok = run("нет белого экрана", "node scripts/check-crash.mjs") && ok;

if (!ok) {
  console.log("\nбыстрый набор: есть ошибки");
  process.exit(1);
}
console.log("\nбыстрый набор: всё в порядке");
