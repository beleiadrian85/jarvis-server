import { callClaudeWithMCP } from "../claude.js";
import { config, hasOperational } from "../config.js";

/**
 * Cere lui Claude, prin MCP connector, lista task-urilor deschise ale lui Adi
 * din Operational. Claude cheama singur tool-urile serverului MCP.
 *
 * Intoarce text deja sintetizat (lista scurta) sau null daca nu e configurat.
 */
export async function getMyOpenTasks() {
  if (!hasOperational) return null;
  try {
    const text = await callClaudeWithMCP({
      system:
        "Esti un agent care interogheaza aplicatia Operational a lui Adi. " +
        "Foloseste tool-urile disponibile pentru a lista task-urile DESCHISE/in lucru " +
        "atribuite lui Adi (Adrian Belei). Daca nu poti filtra dupa persoana, listeaza toate " +
        "task-urile deschise. Pentru fiecare task extrage TOT ce e disponibil: titlu, status, " +
        "deadline, descriere scurta, cine l-a creat — aceste detalii sunt folosite ulterior " +
        "pentru prioritizare dupa impact (cash-flow, vanzari, finantare, executie, juridic), " +
        "deci nu le omite. Format: o linie per task: " +
        "'• titlu — status — deadline — detalii relevante'. Daca nu sunt task-uri, scrie " +
        "'Niciun task deschis.' Fara introducere, fara concluzie.",
      messages: [
        { role: "user", content: "Care sunt task-urile mele deschise acum in Operational?" },
      ],
      mcpServers: [{ name: "operational", url: config.operationalMcpUrl }],
      maxTokens: 1200,
    });
    return text || "Niciun task deschis.";
  } catch (e) {
    console.error("[operational]", e.message);
    return "Nu am putut citi Operational (verifica OPERATIONAL_MCP_URL).";
  }
}
