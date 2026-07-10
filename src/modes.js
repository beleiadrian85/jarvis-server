/**
 * Modes (PUR): shadow / dry-run / strategy.
 * Rezolva flag-urile din `options` (nu din config → ramane pur si testabil).
 *  - shadow:  ruleaza pipeline dar NU trimite/executa (observare)
 *  - dryRun:  construieste tot dar NU executa
 *  - strategy: strategy engine activ (ChatGPT), doar cand e explicit on
 * Zero importuri/IO/egress.
 */
export function resolveModes(options) {
  const o = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  const shadow = o.shadow === true;
  const dryRun = o.dryRun === true;
  const strategy = o.strategy === true;
  const canSend = !shadow && !dryRun;      // trimiterea catre provider permisa?
  const canExecute = !shadow && !dryRun;   // executia actiunilor permisa?
  const describe = [shadow && "shadow", dryRun && "dry-run", strategy && "strategy"].filter(Boolean).join("+") || "normal";
  return { shadow, dryRun, strategy, canSend, canExecute, describe };
}
