// Разметка условия для приложения.
//
// Раньше задание доезжало до тренажёра сплошным текстом, и таблица «А Б В Г Д»
// превращалась в кашу из букв и цифр. Здесь из снимка страницы вынимается сама
// разметка условия: таблицы, списки, надстрочные и подстрочные знаки — всё, что
// делает задание читаемым. Убирается только служебное: шапка с ответом, формы,
// скрипты и виджет ответа, вместо которого в приложении своё поле.
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.chromium ? pw : pw.default;

const KEEP_TAGS = new Set(["P","BR","B","I","U","EM","STRONG","SUB","SUP","SPAN","DIV","TABLE","THEAD","TBODY","TFOOT",
  "TR","TD","TH","UL","OL","LI","IMG","CENTER","HR","PRE","CODE","SMALL",
  // Разметка формул: банк отдаёт её как MathML, и браузер умеет рисовать её сам.
  "MATH","MSTYLE","MROW","MFRAC","MSUB","MSUP","MSUBSUP","MUNDER","MOVER","MUNDEROVER","MI","MN","MO",
  "MSQRT","MROOT","MTEXT","MSPACE","MTABLE","MTR","MTD","MFENCED","MENCLOSE","MPADDED","MPHANTOM"]);
const KEEP_ATTRS = new Set(["colspan","rowspan","align","valign","src","alt","start","class","displaystyle","mathvariant"]);

export async function cleanBodies(tasks) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.goto("about:blank");
  const out = await page.evaluate(({ list, keepTags, keepAttrs }) => {
    const TAGS = new Set(keepTags);
    const ATTRS = new Set(keepAttrs);
    const box = document.createElement("div");
    document.body.appendChild(box);
    const result = {};

    for (const t of list) {
      // Исходная разметка с сервера лучше снимка страницы: в ней формулы ещё не
      // перерисованы MathJax. Берём её, когда она пришла целой — в первых
      // выгрузках текст в ней побился из-за кодировки.
      const raw = t.raw && !t.raw.includes("\uFFFD") && /[а-яА-Я]{4}/.test(t.raw) ? t.raw : "";
      // Формулы у банка идут с приставкой «m:», как в вордовской разметке, и
      // браузер считает их неизвестными тегами. Без приставки это обычный
      // MathML, который он рисует сам.
      // В серверной разметке картинку вставляет скрипт ShowPictureQ, а тега
      // <img> ещё нет — он появляется в браузере. Подставляем тег сами, иначе
      // вместе с исходной разметкой из задания пропадают все рисунки.
      // В снимке страницы тег <img> скрипт уже поставил, и рядом с ним остался
      // сам вызов: подставив тег ещё раз, мы получили бы рисунок дважды.
      const source = (raw ? raw
        // Вызов бывает и с одним аргументом, и с двумя, и в разных кавычках.
        .replace(/<script[^>]*>\s*ShowPictureQ\(\s*['"]([^'"]+)['"][^)]*\)\s*;?\s*<\/script>/gi,
          (m, src) => '<img src="' + src + '">')
        : t.html)
        .replace(/<m:/g, "<")
        .replace(/<\/m:/g, "</");
      box.innerHTML = source;

      // Шапка задания, свойства, кнопка ответа и скрипты — не условие.
      box.querySelectorAll('[id^="i"], .task-header-panel, .task-info-panel, .answer-panel, script, style, noscript')
        .forEach((n) => { if (n.id === "i" + t.id || !n.id.startsWith("i") || n.id === "i" + t.id) n.remove(); });
      box.querySelectorAll(".hint").forEach((n) => n.remove());

      // Поля ввода в приложении свои, поэтому сами поля убираем. А вот таблицу
      // вокруг них трогать нельзя: у заданий с выбором ответа варианты стоят в
      // одной строке с галочкой, и вместе с таблицей исчезали все варианты.
      // Номера вариантов в банке рисует сама галочка, поэтому, убрав её, надо
      // вернуть номер на место: иначе ответ «23» не к чему отнести.
      const marks = new Map();
      box.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((n) => {
        const table = n.closest("table");
        if (!table) return;
        const list = marks.get(table) || [];
        list.push(n);
        marks.set(table, list);
      });
      marks.forEach((list) => {
        if (list.length < 2) return;
        // Номер ставим только там, где его нет: в части заданий он уже написан
        // отдельной ячейкой, и второй такой же превратил бы список в «1) 1)».
        if (list.some((n) => /\d\s*\)/.test(((n.closest("tr") || n.parentElement) || {}).textContent || ""))) return;
        list.forEach((n, i) => {
          const cell = n.closest("td, th") || n.parentElement;
          if (!cell) return;
          if (!(cell.textContent || "").replace(/[\s\u00A0]/g, "")) cell.setAttribute("data-number", String(i + 1) + ")");
        });
      });

      box.querySelectorAll("select, input, button, textarea").forEach((n) => {
        // Таблица, в которой стояли галочки или поля, — это список вариантов,
        // а не таблица с данными: сетку ей рисовать не нужно.
        const table = n.closest("table");
        if (table) table.setAttribute("data-widget", "1");
        n.remove();
      });
      box.querySelectorAll("[data-number]").forEach((cell) => {
        cell.textContent = cell.getAttribute("data-number");
        cell.removeAttribute("data-number");
      });

      // Осталась только сетка для ответа — «А Б В Г Д» с рядом цифр под ними.
      // Её убираем: в приложении ответ вписывают в своё поле.
      box.querySelectorAll("table").forEach((table) => {
        if (table.querySelector("table, img")) return;
        const text = (table.textContent || "").replace(/[\s\u00A0]/g, "");
        if (text.length <= 40 && /^[А-ДA-E0-9]*$/u.test(text)) table.remove();
      });

      // Форму не удаляем: внутри неё лежит само условие — разворачиваем её.
      box.querySelectorAll("form").forEach((f) => f.replaceWith(...f.childNodes));

      // Картинки подменяем на вшитые: ссылки на чужой сайт в приложении не нужны.
      const pics = {};
      (t.pictures || []).forEach((p) => {
        if (p.data && p.src) pics[String(p.src).split("/").pop()] = p.data;
      });
      const already = new Set();
      box.querySelectorAll("img").forEach((img) => {
        const name = String(img.getAttribute("src") || "").split("/").pop();
        // Один и тот же рисунок дважды — это разметка банка, а не задание.
        if (!pics[name] || already.has(name)) { img.remove(); return; }
        already.add(name);
        img.setAttribute("src", pics[name]);
      });

      // Чистим разметку: оставляем только знакомые теги и безопасные атрибуты.
      let guard = 0;
      let changed = true;
      while (changed && guard++ < 30) {
        changed = false;
        box.querySelectorAll("*").forEach((el) => {
          // У тегов MathML имя остаётся строчным (это не HTML), поэтому
          // сравнивать надо в одном регистре — иначе формулы не проходят
          // белый список и разворачиваются в набор букв.
          if (!TAGS.has(el.tagName.toUpperCase())) {
            el.replaceWith(...el.childNodes);
            changed = true;
            return;
          }
          [...el.attributes].forEach((a) => {
            const name = a.name.toLowerCase();
            if (!ATTRS.has(name)) el.removeAttribute(a.name);
            // Метку «таблица с данными» ставим сами ниже; чужие классы не нужны.
            if (name === "class" && !/^(t|cols|col)$/.test(a.value)) el.removeAttribute(a.name);
          });
        });
      }

      // Ширины из вёрстки банка распирают карточку на телефоне: у банка страница
      // рассчитана на настольный экран, у нас — нет.
      box.querySelectorAll("table, td, th, tr, div, p").forEach((el) => {
        el.removeAttribute("width");
        el.removeAttribute("height");
      });

      // Таблица с данными и таблица для раскладки выглядят одинаково, а
      // показывать их надо по-разному: данные — с сеткой, раскладку — без неё.
      // Отличаем по числу колонок: у раскладки их две (буква и текст), у данных
      // больше, и вложенных таблиц в ней нет.
      box.querySelectorAll("table").forEach((table) => {
        if (table.querySelector("table") || table.hasAttribute("data-widget")) return;
        const rows = [...table.rows];
        const columns = Math.max(0, ...rows.map((r) => r.cells.length));
        // Пустые колонки (там, где стояли галочки) за колонки не считаем.
        const filled = [];
        for (let i = 0; i < columns; i += 1) {
          const cells = rows.map((r) => r.cells[i]).filter(Boolean);
          if (cells.some((c) => (c.textContent || "").replace(/[\s\u00A0]/g, "") || c.querySelector("img"))) filled.push(i);
        }
        if (rows.length >= 3 && filled.length >= 3) table.setAttribute("class", "t");
      });
      box.querySelectorAll("[data-widget]").forEach((n) => n.removeAttribute("data-widget"));

      // Раскладку в два столбца («ПОЛНОМОЧИЯ» слева, «СУБЪЕКТЫ» справа) банк
      // делает таблицей: шапки в одной строке, списки в другой. На узком экране
      // такая таблица разваливается — обе шапки уезжают наверх, а списки под них.
      // Поэтому переворачиваем её в настоящие колонки, каждая со своей шапкой:
      // на широком экране они стоят рядом, на телефоне — друг под другом.
      box.querySelectorAll("table").forEach((table) => {
        if (!table.isConnected || !table.querySelector("table")) return;
        const rows = [...table.rows].filter((r) => r.parentElement.parentElement === table);
        if (!rows.length) return;
        const columns = Math.max(...rows.map((r) => r.cells.length));
        if (columns < 2 || columns > 4) return;
        if (rows.some((r) => [...r.cells].some((c) => Number(c.getAttribute("colspan") || 1) > 1))) return;

        // Сначала смотрим, какие колонки вообще не пустые, и только потом
        // трогаем содержимое: иначе при отказе от перестройки оно пропадает.
        const filled = [];
        for (let i = 0; i < columns; i += 1) {
          const cells = rows.map((r) => r.cells[i]).filter(Boolean);
          const has = cells.some((c) => (c.textContent || "").replace(/[\s\u00A0]/g, "") || c.querySelector("img, table"));
          if (has) filled.push(i);
        }
        if (filled.length < 2) return;

        const cols = document.createElement("div");
        cols.setAttribute("class", "cols");
        filled.forEach((i) => {
          const col = document.createElement("div");
          col.setAttribute("class", "col");
          rows.forEach((row) => {
            const cell = row.cells[i];
            if (!cell) return;
            while (cell.firstChild) col.appendChild(cell.firstChild);
          });
          cols.appendChild(col);
        });
        table.replaceWith(cols);
      });

      // Пустые обёртки только мешают.
      for (let i = 0; i < 4; i += 1) {
        box.querySelectorAll("p, div, span, b, i, u, td, tr, table, tbody").forEach((el) => {
          if (!el.querySelector("img, math") && !(el.textContent || "").replace(/[\s ]/g, "")) {
            if (el.tagName === "TD" || el.tagName === "TH") return; // пустая ячейка держит колонку
            el.remove();
          }
        });
      }

      result[t.id] = box.innerHTML.replace(/\s+/g, " ").replace(/> </g, "><").trim();
    }
    return result;
  }, { list: tasks, keepTags: [...KEEP_TAGS], keepAttrs: [...KEEP_ATTRS] });

  await browser.close();
  return out;
}
