import { BANK_SUBJECTS } from "./fipi-index.js";

// Что есть в тренажёре. С 1.11.2.2 — только обществознание: физику и
// информатику убрали. Опись (fipi-index.js) и наборы в src/bank остаются —
// по ним в дневнике и на графиках узнаётся время, уже решённое по этим
// предметам, и оно никуда не пропадает. Вернуть предмет — убрать его из OFF.
const OFF = ["physics", "informatics"];

export const TRAINER_SUBJECTS = BANK_SUBJECTS.filter((s) => !OFF.includes(s.file));

const ON = new Set(TRAINER_SUBJECTS.map((s) => s.name));
export const inTrainer = (name) => ON.has(name);
