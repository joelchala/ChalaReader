/**
 * Configuración centralizada de ChalaReader (Suite Chala).
 * Define la paleta "Escudo Cibernético", temas de lectura, enlaces de la Suite Chala,
 * donaciones por PayPal y prefijos de URLs protegidas del navegador.
 */

export const PAYPAL_DONATE_URL = "https://www.paypal.com/ncp/payment/VSWPSS7D4ZRH2";

export const CONFIG = {
  APP_NAME: "ChalaReader",
  VERSION: "1.0.0",
  PAYPAL_DONATE_URL,
  GITHUB_REPO_URL: "https://github.com/joelchala/ChalaReader",
  SUITE_LINKS: {
    chalablock: "https://github.com/joelchala/Chalablock",
    chalavpn: "https://github.com/joelchala/ChalaVPN",
    chalatabs: "https://github.com/joelchala/ChalaTabs",
    chaladev: "https://github.com/joelchala/ChalaDev"
  },
  COLORS: {
    PRIMARY: "#10B981",
    ACCENT: "#06B6D4",
    BG_DARK: "#0F172A",
    SURFACE: "#1E293B",
    TEXT_MAIN: "#F1F5F9"
  },
  THEMES: {
    dark: {
      id: "dark",
      bg: "#0F172A",
      card: "#1E293B",
      text: "#F1F5F9",
      muted: "#94A3B8",
      primary: "#10B981",
      accent: "#06B6D4"
    },
    sepia: {
      id: "sepia",
      bg: "#F5EEDB",
      card: "#FAF4E6",
      text: "#3B3226",
      muted: "#6E5D4F",
      // Alineado con reader-theme.css (variantes con más contraste sobre fondo sepia)
      primary: "#0F9F70",
      accent: "#0891B2"
    },
    light: {
      id: "light",
      bg: "#FFFFFF",
      card: "#F8FAFC",
      text: "#1E293B",
      muted: "#64748B",
      primary: "#10B981",
      accent: "#06B6D4"
    }
  },
  WORDS_PER_MINUTE: 220,
  DEFAULT_SETTINGS: {
    theme: "dark",
    fontFamily: "sans",
    fontSize: 19,
    lineHeight: 1.75,
    maxWidth: 70
  },
  STORAGE_KEYS: {
    SETTINGS: "chalareader_settings",
    SAVED_ARTICLES: "chalareader_saved_articles"
  },
  PROTECTED_URL_PREFIXES: [
    "chrome://",
    "edge://",
    "about:",
    "chrome-extension://",
    "extension://",
    "devtools://",
    "view-source:",
    "chrome-search://",
    "chrome-untrusted://",
    "edge-untrusted://",
    "data:",
    "javascript:",
    "https://chrome.google.com/webstore",
    "https://chromewebstore.google.com",
    "https://microsoftedge.microsoft.com/addons"
  ]
};

/**
 * Determina si una URL pertenece a una página interna o protegida del navegador
 * donde Chromium/Edge restringen la inyección de scripts.
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isRestrictedUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    return true;
  }
  const normalized = rawUrl.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return CONFIG.PROTECTED_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
