import React from "react";
import StudyPlanner from "./study-planner.jsx";

// Панель входа и кнопка установки переехали внутрь приложения, на экран
// «Синхронизация»: в новой раскладке всё живёт внутри оболочки с навигацией.
export default function App() {
  return <StudyPlanner />;
}
