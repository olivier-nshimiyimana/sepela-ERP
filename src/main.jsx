import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { DatabaseProvider } from "./contexts/DatabaseContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import "./App.css";
import "./security/hardenUi.js";
import { initWebviewShell } from "./utils/webviewShell";

initWebviewShell();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DatabaseProvider>
      <NotificationProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NotificationProvider>
    </DatabaseProvider>
  </React.StrictMode>
);