import React from "react";
import CloudPanel from "./cloud-panel.jsx";
import InstallHint from "./install-hint.jsx";
import StudyPlanner from "./study-planner.jsx";

export default function App() {
  return (
    <>
      <InstallHint />
      <CloudPanel />
      <StudyPlanner />
    </>
  );
}
