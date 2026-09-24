import { useState } from "react";

// Какой дизайн показывать: новый (1.0.0) или прежний (как в 0.14.0).
//
// Это настройка устройства, как тема: на телефоне можно остаться на прежнем,
// пока привыкаешь, а на ноутбуке уже пользоваться новым. Поэтому выбор лежит в
// localStorage и в облако не едет. Записи от дизайна не зависят — меняется
// только то, как они нарисованы.
//
// Значение держится и в переменной модуля, а не только в состоянии React:
// объекты стилей и мелкие компоненты (заголовок карточки) спрашивают его прямо
// во время отрисовки, и к этому моменту оно уже должно быть новым.
const KEY = "planner-design";
// Окно «Новый дизайн» показываем один раз на устройстве.
export const DESIGN_INTRO_KEY = "planner-design-intro";
export const DESIGN_INTRO_VERSION = "1.0.0";

function read() {
  try {
    return localStorage.getItem(KEY) === "classic" ? "classic" : "new";
  } catch (e) {
    return "new";
  }
}

let current = read();

export function isClassic() {
  return current === "classic";
}

function apply(value) {
  current = value;
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-design", value);
}

export function useDesign() {
  const [design, setDesignState] = useState(current);

  function setDesign(next) {
    const value = next === "classic" ? "classic" : "new";
    apply(value);
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* приватный режим — выбор доживёт до перезагрузки */
    }
    setDesignState(value);
  }

  return { design, classic: design === "classic", setDesign };
}

apply(current);
