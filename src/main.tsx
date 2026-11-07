import { createRoot } from "react-dom/client";
import App from "./App";
import { BitoTheme } from "./ui/BitoTheme";
import "./ui/astryx-bito.css";
import "./ui/workspace.css";
import "./ui/product.css";
createRoot(document.getElementById("root")!).render(
  <BitoTheme>
    <App />
  </BitoTheme>,
);
