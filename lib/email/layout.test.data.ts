import type { EmailConfig } from "./layout";

export const BASE = "https://app.example.com";
export const SAMPLE = `Ciao <gruppo> & amici,\nriga due\n\nApri nell'app: ${BASE}/ordine/42\n\n482913\n\nGestisci le preferenze: ${BASE}/profilo/notifiche\n\nIl link è https://other.example.test/a?x=1&y=2.`;
export const OPTIONS = { subject: "Oggetto <1>", baseUrl: `${BASE}/` };
export const WG: EmailConfig = {
  appName: "WeGrocery", flylabsUrl: "https://www.flylabs.ai/it", logo: { url: "/mail/logo.png", width: 164, height: 40 },
  theme: { background: "#faf8f5", card: "#ffffff", foreground: "#2d2b29", mutedForeground: "#6b6b6b", primary: "#f5a623", primaryForeground: "#2d2b29", primaryText: "#8e6014", border: "#eeeeef" },
  buttonText: { app: "Apri l'app", link: "Apri il link", preferences: "Gestisci le notifiche" },
  pageLabels: [["/login", "Entra"], ["/ordine", "Vai all'ordine"], ["/storico", "Apri lo Storico"], ["/ricarica", "Vai alla ricarica"], ["/famiglia", "Apri Famiglia"], ["/calendario", "Apri il calendario"], ["/notifiche", "Apri le notifiche"], ["/profilo", "Apri il profilo"], ["/admin", "Apri l'area Admin"]],
  preferencesPath: "/profilo/notifiche", textMode: "rich",
  identity: { name: "Gruppo Esempio", logoUrl: `${BASE}/brand/logo.png`, showName: true, colors: { background: "#f4f8f4", mutedForeground: "#5f6b5f", primary: "#2e7d32", primaryForeground: "#ffffff", primaryText: "#2e7d32" } },
};
export const STELLAR: EmailConfig = {
  appName: "Stellar Reviews", flylabsUrl: "https://www.flylabs.ai/it/stellar-reviews", logo: { url: "/mail/stellar-logo.png", width: 180, height: 33 },
  theme: { background: "#fafaf8", card: "#ffffff", foreground: "#15151a", mutedForeground: "#66666d", primary: "#343bec", primaryForeground: "#ffffff", primaryText: "#343bec", border: "#e7e5e0" },
  buttonText: { app: "Apri l'app", link: "Apri il link", preferences: "Gestisci le notifiche" },
  pageLabels: [["/login", "Entra"], ["/dashboard", "Apri la dashboard"]], preferencesPath: "/account/notifiche", textMode: "plain",
};
