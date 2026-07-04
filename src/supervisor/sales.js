import { opsQuery, hasOpsDb } from "./opsdb.js";
import { getState, setState } from "../state.js";
import { audit } from "../audit.js";

/**
 * Monitorizare zilnica Vanzari + Parteneri (Bell Residence).
 * FACTUAL: stoc, miscari fata de ieri, riscuri concrete, activitate parteneri
 * (raportul „spion"). Fara speculatii — doar ce arata datele.
 */
const money = (n) => Math.round(Number(n) || 0).toLocaleString("ro-RO");
const daysSince = (ts) => (ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000) : Infinity);
const isPartener = (id) => /^partener/.test(id || "");

async function collectSales() {
  const [units, agents, changeReqs] = await Promise.all([
    opsQuery(`SELECT id, unit, floor, apt_type, price, currency, status, client, advance, reserved_by, reserved_date FROM sales_units`),
    opsQuery(`SELECT id, name, blocked FROM users WHERE role = 'Vanzari' ORDER BY created_at`),
    opsQuery(`SELECT count(*)::int c FROM sales_change_requests WHERE state = 'in_asteptare'`).catch(() => [{ c: 0 }]),
  ]);
  for (const a of agents) {
    const lg = (await opsQuery(
      `SELECT count(*)::int c, max(created_at) last FROM access_log WHERE user_id = $1 AND kind = 'login'`, [a.id]
    ).catch(() => [{}]))[0] || {};
    a.logins = lg.c || 0;
    a.lastLogin = lg.last || null;
  }
  return { units, agents, pendingReqs: changeReqs[0]?.c || 0 };
}

export async function buildSalesReport({ markSeen = true } = {}) {
  if (!hasOpsDb) return "Vânzări: conexiunea la Operational nu e configurată.";
  const { units, agents, pendingReqs } = await collectSales();

  const by = (st) => units.filter((u) => u.status === st);
  const disp = by("disponibil"), rez = by("rezervat"), vand = by("vandut");
  const avans = units.reduce((s, u) => s + (Number(u.advance) || 0), 0);

  // Miscari fata de ieri (diff pe status).
  const prev = (await getState("sales_prev", null)) || {};
  const moves = [];
  const cur = {};
  for (const u of units) {
    cur[u.id] = u.status;
    if (prev[u.id] && prev[u.id] !== u.status) {
      moves.push(`${u.floor || ""} ${u.unit}: ${prev[u.id]} → ${u.status}`);
    }
  }
  if (markSeen) await setState("sales_prev", cur);

  // Riscuri concrete.
  const rezFaraAvans = rez.filter((u) => !Number(u.advance));
  const rezVechi = rez.filter((u) => daysSince(u.reserved_date) > 30);

  const today = new Date().toLocaleDateString("ro-RO", { day: "numeric", month: "long", timeZone: "Europe/Bucharest" });
  const L = [];
  L.push(`📊 Vânzări Bell Residence — ${today}`);
  L.push(`Stoc: 🟢 ${disp.length} disponibile · 🟠 ${rez.length} rezervate · ✅ ${vand.length} vândute (${units.length} total)`);
  L.push(`Valoare: vândut ${money(vand.reduce((s, u) => s + (+u.price || 0), 0))} € · rezervat ${money(rez.reduce((s, u) => s + (+u.price || 0), 0))} € · avans încasat ${money(avans)} €`);

  L.push("");
  L.push("Mișcări de ieri:");
  L.push(moves.length ? moves.map((m) => `• ${m}`).join("\n") : "• Nicio schimbare.");

  const alerts = [];
  if (rezFaraAvans.length) alerts.push(`🔴 ${rezFaraAvans.length} rezervări fără avans (bani neîncasați): ${rezFaraAvans.map((u) => u.unit).join(", ")}`);
  if (rezVechi.length) alerts.push(`🟠 ${rezVechi.length} rezervări mai vechi de 30 zile (neconvertite în vânzare)`);
  if (pendingReqs) alerts.push(`📋 ${pendingReqs} cereri de modificare așteaptă aprobarea ta`);
  if (alerts.length) { L.push(""); L.push("De urmărit:"); L.push(alerts.join("\n")); }

  L.push("");
  L.push("Parteneri (activitate):");
  for (const a of agents) {
    const last = a.lastLogin ? `acum ${daysSince(a.lastLogin)} zile` : "niciodată";
    const rezervate = units.filter((u) => u.reserved_by === a.id && u.status === "rezervat").length;
    const vandute = units.filter((u) => u.reserved_by === a.id && u.status === "vandut").length;
    const inactiv = isPartener(a.id) && daysSince(a.lastLogin) > 3;
    L.push(`• ${a.name}${a.blocked ? " 🔒blocat" : ""}${inactiv ? " 🔴inactiv" : ""} — ${a.logins} loginuri, ultim: ${last}` +
      (rezervate || vandute ? ` · rez ${rezervate}/vând ${vandute}` : ""));
  }

  await audit("sales_report", `${vand.length} vândute, ${rez.length} rezervate`, "monitorizare zilnica");
  return L.join("\n");
}
