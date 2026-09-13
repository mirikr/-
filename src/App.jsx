import React from "react";
import StudyPlanner from "./study-planner.jsx";
import ErrorBoundary from "./error-boundary.jsx";

// Панель входа и кнопка установки переехали внутрь приложения, на экран
// «Синхронизация»: в новой раскладке всё живёт внутри оболочки с навигацией.
//
// Снаружи — страховка: что бы внутри ни упало, вместо белого листа человек
// увидит, что записи целы, и сможет забрать их копию.
export default function App() {
  return (
    <ErrorBoundary>
      <StudyPlanner />
    </ErrorBoundary>
  );
}
