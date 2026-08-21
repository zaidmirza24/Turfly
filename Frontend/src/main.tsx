import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/logger";
import "./index.css";

// Registered before render so a crash during the first paint is still caught.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary boundary="root">
    <App />
  </ErrorBoundary>
);
