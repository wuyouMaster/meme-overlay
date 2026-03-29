import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../i18n";
import { SettingsApp } from "./SettingsApp";

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <SettingsApp />
  </I18nProvider>
);
