import { config } from "../config.js";
import { gapi, googleConnected } from "../google.js";

/**
 * Drive readonly, limitat la folderul dedicat "JARVIS".
 * Folosit la cautari cerute explicit in chat.
 */

let folderId = null;

async function getFolderId() {
  if (folderId) return folderId;
  const d = await gapi(
    "https://www.googleapis.com/drive/v3/files?" +
      new URLSearchParams({
        q: `name = '${config.google.driveFolder.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id,name)",
        pageSize: "1",
      })
  );
  folderId = d.files?.[0]?.id || null;
  if (!folderId) throw new Error(`Folderul Drive "${config.google.driveFolder}" nu exista.`);
  return folderId;
}

/** Cauta fisiere dupa nume in folderul JARVIS. */
export async function searchDrive(text, limit = 8) {
  if (!(await googleConnected())) return null;
  try {
    const fid = await getFolderId();
    const d = await gapi(
      "https://www.googleapis.com/drive/v3/files?" +
        new URLSearchParams({
          q: `'${fid}' in parents and name contains '${text.replace(/'/g, "\\'")}' and trashed = false`,
          fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
          orderBy: "modifiedTime desc",
          pageSize: String(limit),
        })
    );
    return (d.files || []).map((f) => ({
      name: f.name,
      modified: f.modifiedTime?.slice(0, 10),
      link: f.webViewLink,
    }));
  } catch (e) {
    console.error("[drive]", e.message);
    return null;
  }
}
