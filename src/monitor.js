import tls from "node:tls";
import cron from "node-cron";
import { config } from "./config.js";
import { pushToOwner } from "./telegram.js";
import { getState, setState, wasNotified, markNotified } from "./state.js";

/**
 * FAZA 3 — monitor site (pregatit pentru bellresidence.ro).
 * Dormant daca SITE_MONITOR_URL e gol. Cand e setat:
 *   - la 15 min: uptime + timp de raspuns, cu notificare la tranzitie sus/jos;
 *   - zilnic 08:00: expirare certificat TLS (alerta daca < 14 zile).
 * Formular de contact + expirare domeniu: se adauga cand site-ul e live
 * si stim structura paginii.
 */
export function startMonitor() {
  if (!config.siteMonitorUrl) {
    console.log("[monitor] dormant (SITE_MONITOR_URL gol).");
    return;
  }
  cron.schedule("*/15 * * * *", checkSite, { timezone: "Europe/Bucharest" });
  cron.schedule("0 8 * * *", checkCert, { timezone: "Europe/Bucharest" });
  console.log("[monitor] activ pe", config.siteMonitorUrl);
  checkSite();
}

async function checkSite() {
  const url = config.siteMonitorUrl;
  const wasUp = (await getState("site_up", true)) !== false;
  try {
    const t0 = Date.now();
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const ms = Date.now() - t0;

    if (!res.ok) {
      if (wasUp) await pushToOwner(`⚠️ ${url} răspunde ${res.status} (${ms}ms).`);
      await setState("site_up", false);
      return;
    }
    if (!wasUp) await pushToOwner(`🟢 ${url} a revenit online (${ms}ms).`);
    await setState("site_up", true);

    if (ms > 5000) {
      const k = `slow:${new Date().toISOString().slice(0, 13)}`; // max o data/ora
      if (!(await wasNotified(k))) {
        await pushToOwner(`🐢 ${url} răspunde lent: ${ms}ms.`);
        await markNotified(k);
      }
    }
  } catch (e) {
    if (wasUp) await pushToOwner(`🔴 ${url} pare PICAT: ${e.message}.`);
    await setState("site_up", false);
  }
}

function checkCert() {
  let host;
  try {
    host = new URL(config.siteMonitorUrl).hostname;
  } catch {
    return;
  }
  const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, async () => {
    const cert = socket.getPeerCertificate();
    socket.end();
    if (!cert || !cert.valid_to) return;
    const days = Math.round((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
    if (days <= 14) {
      await pushToOwner(`🔐 Certificatul ${host} expiră în ${days} zile (${cert.valid_to}).`);
    }
  });
  socket.on("error", (e) => console.error("[monitor.cert]", e.message));
  socket.on("timeout", () => socket.destroy());
}
