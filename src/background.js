import { CONFIG, isRestrictedUrl } from "./config.js";

let cachedCssText = null;

/**
 * Carga en memoria la hoja de estilos encapsulada del lector desde el paquete local.
 * No realiza peticiones externas ni expone recursos en web_accessible_resources.
 * @returns {Promise<string>}
 */
export async function loadReaderCssText() {
  if (typeof cachedCssText === "string" && cachedCssText.length > 0) {
    return cachedCssText;
  }
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL && typeof fetch === "function") {
      const cssUrl = chrome.runtime.getURL("content/reader-theme.css");
      const response = await fetch(cssUrl);
      if (response.ok) {
        cachedCssText = await response.text();
        return cachedCssText;
      }
    }
  } catch {
    // Fallback controlado si fetch no está disponible en entorno de pruebas
  }
  return "";
}

/**
 * Obtiene la pestaña activa actual usando el parámetro del evento o consultando la ventana enfocada.
 * No requiere permiso "tabs" gracias a activeTab al activarse desde action/commands.
 * @param {chrome.tabs.Tab|undefined} providedTab
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
export async function getActiveTab(providedTab) {
  if (providedTab && typeof providedTab.id === "number") {
    return providedTab;
  }
  if (!chrome.tabs?.query) {
    return null;
  }
  const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentTabs && currentTabs[0]) {
    return currentTabs[0];
  }
  const fallbackTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return fallbackTabs?.[0] || null;
}

/**
 * Valida que la pestaña no sea una URL interna protegida del navegador e inyecta
 * de forma idempotente el motor de lectura bajo demanda.
 * @param {chrome.tabs.Tab|undefined} providedTab
 * @returns {Promise<{ok: boolean, restricted?: boolean, reason?: string, tabId?: number, url?: string}>}
 */
export async function toggleReaderOnTab(providedTab) {
  let tab = null;
  try {
    tab = await getActiveTab(providedTab);
  } catch {
    tab = null;
  }
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, restricted: true, reason: "NO_TAB" };
  }

  const rawUrl = tab.url || tab.pendingUrl || "";
  if (isRestrictedUrl(rawUrl)) {
    return {
      ok: false,
      restricted: true,
      reason: "RESTRICTED_URL",
      tabId: tab.id,
      url: rawUrl
    };
  }

  try {
    const cssText = await loadReaderCssText();

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (bootstrapPayload) => {
        window.__CHALAREADER_BOOTSTRAP__ = bootstrapPayload;
      },
      args: [{ config: CONFIG, cssText }]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/readability.js", "content/reader-engine.js"]
    });

    return {
      ok: true,
      restricted: false,
      tabId: tab.id,
      url: rawUrl
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || "");
    return {
      ok: false,
      restricted: true,
      reason: "INJECTION_BLOCKED",
      error: message,
      tabId: tab.id,
      url: rawUrl
    };
  }
}

/**
 * Indica brevemente en el icono que el lector no puede abrirse en esta pestaña
 * (antes el fallo era totalmente silencioso). No requiere permisos adicionales.
 * @param {{ok: boolean, tabId?: number}} result
 */
export function reportToggleResult(result) {
  if (!result || result.ok || typeof result.tabId !== "number" || !chrome.action?.setBadgeText) {
    return;
  }
  const tabId = result.tabId;
  try {
    chrome.action.setBadgeBackgroundColor?.({ tabId, color: "#F43F5E" })?.catch?.(() => {});
    chrome.action.setBadgeText({ tabId, text: "!" })?.catch?.(() => {});
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" })?.catch?.(() => {});
    }, 2500);
  } catch {
    // La pestaña pudo cerrarse; no es crítico
  }
}

function handleToggle(tab) {
  toggleReaderOnTab(tab)
    .then(reportToggleResult)
    .catch(() => {});
}

/**
 * Registra los listeners principales del Service Worker Manifest V3.
 */
export function registerBackgroundListeners() {
  if (chrome.action?.onClicked) {
    chrome.action.onClicked.addListener((tab) => {
      handleToggle(tab);
    });
  }

  if (chrome.commands?.onCommand) {
    chrome.commands.onCommand.addListener((command, tab) => {
      if (command === "toggle-reader") {
        handleToggle(tab);
      }
    });
  }

  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "CHALAREADER_GET_BOOTSTRAP") {
        loadReaderCssText()
          .then((cssText) => {
            sendResponse({ ok: true, config: CONFIG, cssText });
          })
          .catch(() => {
            sendResponse({ ok: true, config: CONFIG, cssText: "" });
          });
        return true;
      }
      return false;
    });
  }
}

export { isRestrictedUrl };

if (typeof chrome !== "undefined" && chrome.runtime && chrome.action && chrome.commands) {
  registerBackgroundListeners();
}
