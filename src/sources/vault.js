import fs from "node:fs";
import path from "node:path";
import { config, hasVault } from "../config.js";

/**
 * Sursa "firma-vault" (Obsidian) pentru morning briefing.
 *
 * Doua moduri, in ordine de prioritate:
 *  1. VAULT_PATH local — daca JARVIS ruleaza pe acelasi PC ca vault-ul.
 *  2. VAULT_REPO + VAULT_GH_TOKEN — JARVIS pe Railway citeste repo-ul GitHub PRIVAT.
 *
 * GUARD anti-prompt-injection (spec 4.3): continutul notelor e tratat ca DATE,
 * nu ca instructiuni. Extragem DOAR checkbox-uri deschise `- [ ]` si termenul
 * `#deadline-*` din ele, ca text simplu. Nu executam nimic din note.
 */

const MAX_TASKS = 15;

function extractOpenTasks(text, relPath) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(/^\s*[-*]\s+\[ \]\s+(.+)$/);
    if (!m) continue;
    const task = m[1].trim();
    if (!task || task.startsWith("Exemplu")) continue; // ignora linia-exemplu din _welcome
    const deadline = task.match(/#deadline-([\w-]+)/)?.[1] || null;
    out.push({ task, deadline, file: relPath });
  }
  return out;
}

function walkLocal(dir, base, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // .obsidian, .git, .trash
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkLocal(full, base, acc);
    else if (entry.name.endsWith(".md")) {
      const rel = path.relative(base, full).replace(/\\/g, "/");
      acc.push(...extractOpenTasks(fs.readFileSync(full, "utf8"), rel));
    }
  }
  return acc;
}

async function fromLocal() {
  if (!fs.existsSync(config.vault.path)) return null;
  return walkLocal(config.vault.path, config.vault.path, []);
}

async function fromGitHub() {
  const { repo, branch, token } = config.vault;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "jarvis-server",
  };
  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) throw new Error(`tree ${treeRes.status}`);
  const tree = await treeRes.json();
  const mdFiles = (tree.tree || []).filter(
    (n) => n.type === "blob" && n.path.endsWith(".md") && !n.path.startsWith(".")
  );
  const acc = [];
  // Secvential, limitat — un vault are zeci de note, nu mii.
  for (const f of mdFiles) {
    const blob = await fetch(
      `https://api.github.com/repos/${repo}/git/blobs/${f.sha}`,
      { headers }
    );
    if (!blob.ok) continue;
    const j = await blob.json();
    const text = j.encoding === "base64"
      ? Buffer.from(j.content, "base64").toString("utf8")
      : j.content;
    acc.push(...extractOpenTasks(text, f.path));
  }
  return acc;
}

/**
 * Intoarce un rezumat text al actiunilor deschise din vault, sau null daca
 * vault-ul nu e configurat / inaccesibil. Termenele apropiate primele.
 */
export async function getVaultDigest() {
  if (!hasVault) return null;
  try {
    const tasks = config.vault.path ? await fromLocal() : await fromGitHub();
    if (!tasks) return null;
    if (!tasks.length) return "VAULT (firma-vault): nicio actiune deschisa.";

    tasks.sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });

    const lines = tasks.slice(0, MAX_TASKS).map((t) => {
      const term = t.deadline ? ` [termen: ${t.deadline}]` : "";
      return `  • ${t.task.replace(/#deadline-[\w-]+/g, "").trim()}${term} (${t.file})`;
    });
    const extra = tasks.length > MAX_TASKS ? `\n  … +${tasks.length - MAX_TASKS} alte actiuni` : "";
    return `VAULT (firma-vault) — actiuni deschise:\n${lines.join("\n")}${extra}`;
  } catch (e) {
    console.error("[vault]", e.message);
    return "VAULT: indisponibil (verifica VAULT_PATH sau VAULT_REPO/VAULT_GH_TOKEN).";
  }
}
