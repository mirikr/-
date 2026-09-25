// Подробности события: время, ссылки, описание.
import { eventTime, eventLinks, eventDescription, splitLinks, normalizeUrl, hasDetails, linkLabel } from "../src/event-details.js";

let bad = 0;
function check(name, ok, note = "") {
  if (!ok) bad += 1;
  console.log((ok ? "  ok    " : "  FAIL  ") + name + (note ? " — " + note : ""));
}

check("время с началом и концом", eventTime({ start: "10:00", end: "13:00" }) === "10:00–13:00");
check("только начало", eventTime({ start: "10:00" }) === "в 10:00");
check("конец равен началу — одно время", eventTime({ start: "10:00", end: "10:00" }) === "в 10:00");
check("без времени — пусто", eventTime({}) === "" && eventTime(null) === "");

check("несколько ссылок", eventLinks({ url: "https://olimpiada.ru/a, vos.olimpiada.ru\nwww.site.org" }).join(" ") === "https://olimpiada.ru/a https://vos.olimpiada.ru https://www.site.org");
check("javascript: — не ссылка", normalizeUrl("javascript:alert(1)") === "" && eventLinks({ url: "javascript:alert(1)" }).length === 0);
check("подпись ссылки — сайт", linkLabel("https://www.olimpiada.ru/vos/2026") === "olimpiada.ru");

const parts = splitLinks("Регистрация на siriusolymp.ru до 1 октября, правила: https://example.org/rules.");
check("ссылки в описании находятся", parts.filter((p) => p.url).map((p) => p.url).join(" ") === "https://siriusolymp.ru https://example.org/rules", JSON.stringify(parts.filter((p) => p.url)));
check("точка после ссылки остаётся текстом", parts[parts.length - 1].text === ".");
check("текст не теряется", parts.map((p) => p.label || p.text).join("") === "Регистрация на siriusolymp.ru до 1 октября, правила: https://example.org/rules.");
check("текст без ссылок — один кусок", splitLinks("просто текст").length === 1);

check("описание одной строкой", eventDescription({ start: "10:00", end: "13:00", place: "Лицей, ауд. 401", url: "olimpiada.ru", note: "взять паспорт" }) === "10:00–13:00 · Лицей, ауд. 401 · https://olimpiada.ru · взять паспорт");
check("пустое событие — без подробностей", !hasDetails({ name: "Экзамен", date: "2026-10-01" }) && eventDescription({}) === "");
check("есть место — есть подробности", hasDetails({ place: "Лицей" }));

console.log(bad ? `\nпровалено: ${bad}` : "\nподробности событий работают");
process.exit(bad ? 1 : 0);
