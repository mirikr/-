// Проверка ответов на тестовые задания ВсОШ и подсчёт баллов.
//
// Баллы считаются так же, как в критериях олимпиады: за каждый верный пункт
// «да/нет», каждое верное соотнесение и каждый верно заполненный пропуск — по
// баллу (или сколько указано), в заданиях «выберите все верные» — балл за
// каждый верный выбор и штраф за каждый неверный, но не меньше нуля, а если
// отмечено больше допустимого — ноль.
//
// Ответ человека хранится в том же виде, в каком его вводят:
//   yesno     — массив true / false / null по пунктам;
//   multi     — массив ключей отмеченных вариантов;
//   one       — ключ выбранного варианта;
//   match     — { А: "3", Б: "1", … };
//   matchmany — { А: ["III", "IV"], … };
//   groups    — { А: 1, Б: 2, … } — номер группы;
//   gaps      — { А: "14", … } — ключ варианта в пропуске;
//   short     — строка.

export const KIND_NAMES = {
  yesno: "да или нет",
  multi: "выбор нескольких",
  one: "выбор одного",
  match: "соответствие",
  matchmany: "соответствие, несколько вариантов",
  groups: "классификация",
  gaps: "пропуски в тексте",
  short: "краткий ответ",
};

// Запись ответа для сравнения: регистр, ё, пробелы, кавычки, проценты и
// единицы измерения не важны; запятая и точка в числах — одно и то же.
export function normalizeShort(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s   ]+/g, "")
    .replace(/[«»"'„“”]/g, "")
    .replace(/(рублей|рубля|руб\.?|р\.|млрд|млн|тыс\.?|%|процентов|процента|п\.п\.?)$/g, "")
    .replace(/,/g, ".")
    .replace(/[–—−]/g, "-")
    .replace(/\.$/, "");
}

export function shortRight(task, value) {
  const given = normalizeShort(value);
  if (!given) return false;
  return [task.answer].concat(task.accept || []).some((key) => {
    const want = normalizeShort(key);
    if (given === want) return true;
    const a = Number(given);
    const b = Number(want);
    return want !== "" && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
  });
}

function multiScore(task, picked, want) {
  if (task.exact) return sameSet(picked, want) ? task.points : 0;
  const set = new Set(want);
  const good = picked.filter((k) => set.has(k)).length;
  const bad = task.over ? Math.max(0, picked.length - want.length) : picked.length - good;
  if (task.limit && picked.length > task.limit) return 0;
  return Math.max(0, good * task.per - bad * (task.penalty || 0));
}

function sameSet(a, b) {
  return a.length === b.length && a.every((k) => b.includes(k));
}

// Все перестановки номеров групп: если группы не названы, «1» и «2» у
// человека могут стоять наоборот, и это тот же верный ответ.
function permutations(n) {
  if (n <= 1) return [[1]];
  const out = [];
  permutations(n - 1).forEach((p) => {
    for (let i = 0; i <= p.length; i += 1) out.push([...p.slice(0, i), n, ...p.slice(i)]);
  });
  return out;
}

// Итог по заданию: баллы, максимум, всё ли верно, и отметки по пунктам для
// подсветки — true (верно), false (неверно), null (не отвечено).
export function scoreTask(task, response) {
  const max = task.max;
  const r = response == null ? {} : response;
  switch (task.kind) {
    case "yesno": {
      const marks = task.answer.map((want, i) => (r[i] == null ? null : r[i] === want));
      const right = marks.filter((m) => m === true).length;
      return { score: right * task.per, max, ok: right === task.answer.length, marks };
    }
    case "multi": {
      const picked = Array.isArray(r) ? r : [];
      const variants = [task.answer].concat(task.alt || []);
      let best = variants[0];
      let score = -1;
      variants.forEach((v) => {
        const s = multiScore(task, picked, v);
        if (s > score || (s === score && sameSet(picked, v))) {
          score = s;
          best = v;
        }
      });
      const ok = variants.some((v) => sameSet(picked, v));
      const marks = {};
      task.options.forEach((o) => {
        const on = picked.includes(o.k);
        const should = best.includes(o.k);
        marks[o.k] = on || should ? on === should : null;
      });
      return { score, max, ok, marks, key: best };
    }
    case "one": {
      const ok = r === task.answer;
      return { score: ok ? task.points : 0, max, ok, marks: { [task.answer]: true, ...(r && !ok ? { [r]: false } : {}) } };
    }
    case "match":
    case "gaps": {
      const keys = task.kind === "match" ? task.items.map((it) => it.k) : task.gaps;
      const marks = {};
      let right = 0;
      keys.forEach((k, i) => {
        const given = r[k];
        const want = task.answer[i];
        marks[k] = given == null || given === "" ? null : Array.isArray(want) ? want.includes(given) : given === want;
        if (marks[k]) right += 1;
      });
      return { score: right * task.per, max, ok: right === keys.length, marks };
    }
    case "matchmany": {
      const marks = {};
      let score = 0;
      let ok = true;
      task.items.forEach((it, i) => {
        const picked = Array.isArray(r[it.k]) ? r[it.k] : [];
        const want = task.answer[i];
        const good = picked.filter((k) => want.includes(k)).length;
        const bad = picked.length - good;
        // В критериях — «балл за каждый верный выбор», без штрафа. Без него
        // отметить все абзацы подряд было бы выгоднее всего, поэтому лишний
        // выбор снимает балл.
        score += Math.max(0, good - bad) * task.per;
        const same = sameSet(picked, want);
        if (!same) ok = false;
        marks[it.k] = picked.length ? same : null;
      });
      return { score, max, ok, marks };
    }
    case "groups": {
      const keys = task.items.map((it) => it.k);
      const perms = task.fixed ? [Array.from({ length: task.groups }, (_, i) => i + 1)] : permutations(task.groups);
      let best = null;
      perms.forEach((perm) => {
        // perm[g-1] — какой номер группы у человека соответствует группе g ключа.
        let right = 0;
        const marks = {};
        // Лишнее изображение (0 в ключе) баллов не приносит, но и в верный
        // ответ входит: целиком верно — только если его отложили в сторону.
        let exact = 0;
        keys.forEach((k, i) => {
          const given = r[k];
          const want = task.answer[i] ? perm[task.answer[i] - 1] : 0;
          marks[k] = given == null ? null : given === want;
          if (marks[k]) {
            exact += 1;
            if (want) right += 1;
          }
        });
        if (!best || right > best.right || (right === best.right && exact > best.exact)) best = { right, exact, marks, perm };
      });
      const score = best.right * task.per;
      return { score, max, ok: best.exact === keys.length, marks: best.marks, perm: best.perm };
    }
    case "short": {
      const ok = shortRight(task, r);
      return { score: ok ? task.points : 0, max, ok, marks: {} };
    }
    default:
      return { score: 0, max, ok: false, marks: {} };
  }
}

// Отвечено ли хоть что-то: кнопка «Ответить» без ответа не нужна.
export function hasResponse(task, response) {
  if (response == null) return false;
  switch (task.kind) {
    case "yesno":
      return Array.isArray(response) && response.some((v) => v != null);
    case "multi":
      return Array.isArray(response) && response.length > 0;
    case "one":
    case "short":
      return String(response).trim() !== "";
    case "matchmany":
      return Object.values(response).some((v) => Array.isArray(v) && v.length);
    default:
      return Object.values(response).some((v) => v != null && v !== "");
  }
}

// Ответ строкой — для журнала попыток и поиска по нему.
export function responseText(task, response) {
  if (response == null) return "";
  switch (task.kind) {
    case "yesno":
      return response.map((v) => (v == null ? "—" : v ? "да" : "нет")).join(" ");
    case "multi":
      return [...response].sort().join(", ");
    case "one":
    case "short":
      return String(response);
    case "matchmany":
      return Object.entries(response).map(([k, v]) => k + ": " + (v || []).join(", ")).join("; ");
    default:
      return Object.entries(response).map(([k, v]) => k + " – " + v).join(", ");
  }
}

// Правильный ответ строкой — так, как он записан в ключах олимпиады.
export function keyText(task) {
  switch (task.kind) {
    case "yesno":
      return task.answer.map((v, i) => i + 1 + " – " + (v ? "да" : "нет")).join(", ");
    case "multi":
      return task.answer.join(", ");
    case "one": {
      const o = task.options.find((x) => x.k === task.answer);
      return o && o.t ? task.answer + ". " + o.t : task.answer;
    }
    case "short":
      return task.answer;
    case "match":
      return task.items.map((it, i) => it.k + " – " + [].concat(task.answer[i]).join(" или ")).join(", ");
    case "matchmany":
      return task.items.map((it, i) => it.k + " – " + task.answer[i].join(", ")).join("; ");
    case "gaps":
      return task.gaps.map((g, i) => g + " – " + task.answer[i]).join(", ");
    case "groups": {
      const out = [];
      for (let g = 1; g <= task.groups; g += 1) {
        out.push("группа " + g + ": " + task.items.filter((_, i) => task.answer[i] === g).map((it) => it.k).join(", "));
      }
      if (task.extra) out.push("лишние: " + task.items.filter((_, i) => !task.answer[i]).map((it) => it.k).join(", "));
      return out.join("; ");
    }
    default:
      return "";
  }
}

// Последний ответ на каждое задание — по журналу попыток. По нему считается
// набранное за олимпиаду: перерешал задание — засчитывается новый результат.
export function lastAttempts(log, ids) {
  const out = new Map();
  (log || []).forEach((a) => {
    if (!ids.has(a.taskId)) return;
    const was = out.get(a.taskId);
    if (!was || String(a.at || "") >= String(was.at || "")) out.set(a.taskId, a);
  });
  return out;
}
