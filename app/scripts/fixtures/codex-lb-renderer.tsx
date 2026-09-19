import { createRoot } from "react-dom/client";
import { CodexLbSettings } from "../../src/components/CodexLbSettings";
import "../../src/App.css";

createRoot(document.getElementById("root")!).render(<div style={{ padding: 20 }}><CodexLbSettings /></div>);
