// Перетаскивание файлов мышью (на компьютере): плитку файла берут в тетради
// или у домашнего задания и бросают на ветку тетради, на предмет в списке
// тетрадей или на открытую ветку. Подержали над блоком, предметом или пунктом
// «Тетради» в меню — он открывается сам, и можно бросать дальше.
//
// Что тащат, лежит здесь, а не в dataTransfer: браузер не даёт читать данные
// перетаскивания, пока его не отпустили, а подсветить цель нужно заранее.
// Сам перенос делает приложение: оно регистрирует обработчик (setFileDropHandler),
// потому что записи тетрадей и заданий живут там.

import { useEffect, useRef, useState } from "react";

export const FILE_DRAG_TYPE = "application/x-planner-file";

let current = null; // { file, source }
let dropHandler = null;

// На телефоне перетаскивание не включаем: там долгое нажатие — это прокрутка
// и выделение, а файлы переносят окном «Из загруженных».
export function canDragFiles() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: fine)").matches;
}

export function startFileDrag(e, file, source) {
  current = { file, source };
  try {
    // Только свой тип: с text/plain браузер вставил бы имя файла текстом,
    // если бросить плитку в конспект.
    e.dataTransfer.setData(FILE_DRAG_TYPE, file.path || file.key || file.name);
    e.dataTransfer.effectAllowed = "copyMove";
  } catch (err) {
    /* старый браузер — перетаскивание просто не начнётся */
  }
  document.documentElement.setAttribute("data-file-drag", "1");
}

export function endFileDrag() {
  current = null;
  if (typeof document !== "undefined") document.documentElement.removeAttribute("data-file-drag");
}

export function draggedFile() {
  return current;
}

function isFileDrag(e) {
  if (!current) return false;
  const types = e.dataTransfer && e.dataTransfer.types;
  return !types || Array.from(types).includes(FILE_DRAG_TYPE);
}

export function setFileDropHandler(fn) {
  dropHandler = fn;
}

// target: { ownerKey, blockId, branchId } — ветка; { ownerKey, inbox: true } —
// предмет целиком (файл ляжет в блок «Файлы»).
export function dropFileTo(target) {
  const drag = current;
  endFileDrag();
  if (drag && dropHandler) dropHandler(drag, target);
}

// Отпустили мимо цели или ушли за окно — перетаскивание кончилось. dragend
// приходит к плитке, но её уже может не быть (экран сменился, пока держали
// над «Тетрадями»), поэтому слушаем и окно.
if (typeof window !== "undefined") {
  window.addEventListener("dragend", endFileDrag);
  window.addEventListener("drop", () => setTimeout(endFileDrag, 0));
}

// Свойства для цели. onDrop — бросили сюда; onSpring — подержали над целью
// (раскрыть блок, открыть предмет или раздел). Возвращает [props, over].
export function useFileDropTarget({ onDrop, onSpring, delay = 650 }) {
  const [over, setOver] = useState(false);
  const timer = useRef(null);
  const depth = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function leave() {
    depth.current = 0;
    clearTimeout(timer.current);
    timer.current = null;
    setOver(false);
  }

  const props = {
    onDragEnter: (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
      if (onSpring && !timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          if (current) onSpring();
        }, delay);
      }
    },
    onDragOver: (e) => {
      if (!isFileDrag(e)) return;
      if (!onDrop) return;
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = current.source && current.source.kind === "homework" ? "copy" : "move";
      } catch (err) {
        /* ничего */
      }
    },
    onDragLeave: (e) => {
      if (!isFileDrag(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) leave();
    },
    onDrop: (e) => {
      if (!isFileDrag(e) || !onDrop) return;
      e.preventDefault();
      e.stopPropagation();
      leave();
      onDrop();
    },
    "data-drop-over": over ? "true" : undefined,
  };
  return [props, over];
}
