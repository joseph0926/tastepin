import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SpecimenLab from "./specimens/SpecimenLab";
import "./base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SpecimenLab />
  </StrictMode>,
);
