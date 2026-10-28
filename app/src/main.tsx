import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";
import { followSystemTheme } from "./lib/theme";

followSystemTheme();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
