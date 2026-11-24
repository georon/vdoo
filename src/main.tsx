import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { applyTheme, savedTheme } from "./theme";

// Before the first render, so a chosen theme never flashes the other one.
applyTheme(savedTheme(), false);

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
