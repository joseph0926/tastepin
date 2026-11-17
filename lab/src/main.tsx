import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SpecimenLab from "./specimens/SpecimenLab";
import StudyLab from "./studies/StudyLab";
import "./base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname.startsWith("/studies") ? <StudyLab /> : <SpecimenLab />}
  </StrictMode>,
);
