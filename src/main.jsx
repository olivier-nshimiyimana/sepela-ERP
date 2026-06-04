import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { DatabaseProvider } from "./contexts/DatabaseContext";
import "./App.css";
import "./security/hardenUi.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DatabaseProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </DatabaseProvider>
  </React.StrictMode>
);