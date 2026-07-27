import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TrackerProvider } from "./store";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TrackerProvider>
      <App />
    </TrackerProvider>
  </StrictMode>,
);
