import React from "react";
import ReactDOM from "react-dom/client";
import { PopoverApp } from "@/popover/popover-app";
import "@/index.css";

// Lean, separate entry for the menu-bar popover window — NOT the full dashboard
// bundle, so it opens instantly.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PopoverApp />
  </React.StrictMode>,
);
