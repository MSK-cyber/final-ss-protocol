import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Providers from "./Providers.jsx";
import { loadRuntimeConfig } from "./Constants/RuntimeConfig";

const root = createRoot(document.getElementById("root"));

loadRuntimeConfig().finally(() => {
  root.render(
    <Providers>
      <App />
    </Providers>
  );
});
