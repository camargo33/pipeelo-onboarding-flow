import { createRoot } from "react-dom/client";
// IDV 2026: Inter self-hosted via @fontsource (sem Google Fonts CDN — privacy + sem FOUT)
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
