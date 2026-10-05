import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/global.css";
import { PRODUCT_NAME } from "./brand";

document.documentElement.dataset.surface = "app";
document.title = PRODUCT_NAME;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
