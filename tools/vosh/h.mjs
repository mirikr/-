// Помощники для файлов олимпиад: чтобы варианты ответов не приходилось
// нумеровать руками, а ответы записывались так же, как в ключах.

// Буквы, которыми олимпиада нумерует позиции: без Ё, Й, Ъ, Ы, Ь.
export const RU = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ".split("");
export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

function keyAt(start, i) {
  if (/^\d+$/.test(start)) return String(Number(start) + i);
  if (start === "I") return ROMAN[i];
  if (start === "а") return RU[i].toLowerCase();
  return RU[RU.indexOf(start) + i];
}

// list("1", ["текст", "текст"]) → [{ k: "1", t: "текст" }, …]
// Строка вида "img:файл" — картинка вместо текста.
export function list(start, entries) {
  return entries.map((e, i) => {
    const k = keyAt(start, i);
    if (typeof e === "string" && e.startsWith("img:")) return { k, img: "vosh/" + e.slice(4) + ".webp" };
    if (typeof e === "object") return { k, ...e };
    return { k, t: e };
  });
}

export const img = (name, alt) => ({ src: "vosh/" + name + ".webp", alt: alt || "" });

// Длинные тексты (к заданиям «прочитайте текст») лежат отдельными файлами в
// society/texts: их склеивают из PDF, а не перепечатывают руками.
import { readFileSync } from "node:fs";
export function txt(name) {
  return readFileSync(new URL("./society/texts/" + name + ".txt", import.meta.url), "utf8").trim();
}
