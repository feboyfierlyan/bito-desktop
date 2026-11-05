import { BitoTheme } from "./ui/BitoTheme";
import { createRoot } from "react-dom/client";
import { AreaSelect } from "./AreaSelectView";
import "./AreaSelect.css";
import "./ui/astryx-bito.css";
createRoot(document.getElementById("root")!).render(
  <BitoTheme>
    <AreaSelect />
  </BitoTheme>,
);
