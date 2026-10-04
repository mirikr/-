// Списки классов: класс → ученики (фамилия, имя, почта). Ведёт их разработчик:
// список добавляется сюда и выходит с обновлением. Учитель в журнале выбирает
// класс, ученики подставляются сами; недостающего может добавить в свой журнал.
//
// Почта нужна, чтобы отметки дошли до ученика (по ней база отдаёт ему его
// строки). Всё, что лежит в этом файле, попадает в код сайта и видно любому,
// кто его откроет, — поэтому настоящие списки сюда стоит класть, только
// понимая это (или держать их в облаке, см. отчёт к разделу «Результаты»).
//
// В предпросмотре — учебный список, чтобы было что выбирать.

const DEMO = [
  {
    id: "10b",
    name: "10Б",
    students: [
      { id: "demo-1", last: "Учебный", first: "ученик", email: "student@demo" },
      { id: "demo-2", last: "Иванов", first: "Иван", email: "ivanov@demo" },
      { id: "demo-3", last: "Петрова", first: "Анна", email: "petrova@demo" },
      { id: "demo-4", last: "Сидоров", first: "Пётр", email: "" },
    ],
  },
  {
    id: "11a",
    name: "11А",
    students: [
      { id: "demo-5", last: "Кузнецова", first: "Мария", email: "kuznetsova@demo" },
      { id: "demo-6", last: "Смирнов", first: "Алексей", email: "smirnov@demo" },
    ],
  },
];

const REAL = [];

export const CLASSES = import.meta.env && import.meta.env.VITE_SANDBOX === "1" ? DEMO : REAL;

export function classById(id, classes = CLASSES) {
  return (classes || []).find((c) => c.id === id) || null;
}

// Все ученики всех классов — для поиска «добавить ученика».
export function allStudents(classes = CLASSES) {
  return (classes || []).flatMap((c) => (c.students || []).map((st) => ({ ...st, classId: c.id, className: c.name })));
}
