import { norm } from "./lib/text.js";

/**
 * B3 — detectia intentiilor, extrasa din brain.js (comportament IDENTIC).
 * Functii pure (regex peste text normalizat). Nu ating fluxurile existente.
 */

// Subiect care cere tool-urile Operational (acces COMPLET de supervizor in chat).
export function isOperationalTopic(text) {
  const n = norm(text);
  return /(task|tascu|sarcin|nelu|dana|mihaela|operational|alert|notific|blocat|intarzi|valida|rezolv|partial|criteriu|disciplin|observat|termen|deadline|santier|echipa|cost|costuri|cash|lichiditat|necesar de bani|plat[aei]|obligati|scadent|furnizor|factur|material|comand[ae]|\bpret\b|preturi|jurnal|vanzar|vandut|cumparar|cheltuiel|productie|c3|hipodrom|m[aâ]r[sș]a|proiect|tva|apartament|unitat|bell|residence|partener|spion|rezervat|comision|avans|disponibil|\blead\b|leaduri|vizit|trafic|conversie|mentenant|cladire|memento|banc[aă]|extras|incasar)/.test(n);
}

// Extrage entitatea din "tot ce tine de X" / "tot despre X" (Entity 360).
export function extractEntity(text) {
  const m = text.match(/(?:tot ce [tț]ine de|tot despre|arat[aă]-?mi tot despre|ce [sș]tii despre|informa[tț]ii despre|leg[aă]turi(?:le)?\s+(?:cu|despre)|dosarul(?:\s+lui)?)\s+(.+)$/i);
  if (!m) return null;
  const name = m[1].replace(/[?.!]+\s*$/, "").trim();
  return name.length >= 2 ? name : null;
}

// Intentie Project Intelligence → raport pe proiecte.
export function isProjectTopic(text) {
  const n = norm(text);
  return /(project intelligence|proiectele|toate proiectele|status(ul)? proiect|situati[ae] proiect|cum st(a|au) proiect|raport proiect|costuri pe proiect)/.test(n);
}

// Intentie riscuri → Risk Engine.
export function isRiskTopic(text) {
  const n = norm(text);
  return /(\briscuri\b|\brisc\b|ce riscuri|ce poate merge prost|risk engine|ce ma expune|unde sunt expus|pericol)/.test(n);
}

// Intentie CEO Home / starea firmei → agregator + Health Score.
export function isCeoHomeTopic(text) {
  const n = norm(text);
  return /(\/?ceo\b|ceo home|ceo mode|starea firmei|cum st[aă] firma|cum st[aă]m|dashboard|acas[aă]|sumar firm|health score|scor.*firm|unde st[aă]m)/.test(n);
}

// Extrage soldul curent din mesaj ("cu 200000 in cont", "sold 150.000",
// "1,5 mil", "250 mii", "1.500.000").
export function extractBalance(text) {
  const n = norm(text);
  let m = n.match(/(?:sold|cont|banc[aă]|am|cu)\D{0,10}([\d][\d.,]*)\s*(mii|mil(?:ioane)?|k)?/);
  if (!m) m = n.match(/([\d][\d.,]*)\s*(mii|mil(?:ioane)?|k)\b/);
  if (!m) m = n.match(/([\d][\d.,]{3,})\s*(?:lei\s+)?(?:in|din)\s+(?:cont|banc)/);
  if (!m) return null;
  const raw = m[1];
  const unit = m[2];
  const mul = unit === "mii" || unit === "k" ? 1000 : unit && /mil/.test(unit) ? 1_000_000 : 1;
  let num;
  if (mul !== 1 && /^\d{1,3}([.,]\d{1,3})?$/.test(raw)) num = Number(raw.replace(",", ".")); // zecimal cu unitate
  else num = Number(raw.replace(/\./g, "").replace(",", ".")); // puncte = mii
  if (!isFinite(num)) return null;
  num *= mul;
  if (mul === 1 && num < 1000) return null; // fara unitate, cifre mici = nu e sold
  return num > 0 ? num : null;
}

// Intentie de cash forecast / necesar de plati → Financial Brain determinist.
export function isCashForecastTopic(text) {
  const n = norm(text);
  if (/(forecast|cash ?flow|flux (de )?numerar|necesar (de )?(cash|bani|plat[aei])|situatie financiara|proiectie cash|scadentar|cat.*(am de plat|trebuie sa plat))/.test(n)) return true;
  if (/prognoz/.test(n) && /(cash|plat[aei]|bani|financiar|lichiditat)/.test(n)) return true;
  return false;
}

// Intentie despre email (cautare/citire in Gmail).
export function isEmailTopic(text) {
  const n = norm(text);
  if (/draft/.test(n)) return false; // draftul are flux propriu
  return /(\bemail\b|\bemailuri\b|\bmail\b|\bmailul\b|gmail|in inbox|in casuta|mesaj de la|scrisoare de la|ce mi-a scris|am primit (vreun |un )?(mail|email)|verifica (mailul|emailul|inbox|casuta))/.test(n);
}

// Intentie de calendar / alarma (eveniment de programat).
export function isCalendarTopic(text) {
  const n = norm(text);
  return /(\bin calendar\b|adauga in calendar|pune in calendar|programeaz|fa-?mi (o |un )?(intalnire|eveniment|alarma)|pune-?mi (o |un )?(intalnire|eveniment|alarma)|\bo intalnire\b|\bun eveniment\b|\balarm[aă]\b|treze[sș]te-?ma|rezerv[aă]-?mi|blocheaz[aă]-?mi (in calendar|ora))/.test(n);
}

// Cand chiar e nevoie de internet (altfel chat rapid fara tool-uri).
export function needsWeb(text) {
  const n = norm(text);
  return /(cauta|caut[aă]|pe net|pe internet|google|cat costa|c[aâ]t cost|pret|preturi|curs|euro|dolar|vreme|vremea|meteo|stiri|noutati|adresa|telefon|program(ul)? de|deschis|cota|bursa|legea|reglementar|impozit|tva azi|astazi|acum pe piata)/.test(n);
}

export function guessCategory(text) {
  const n = norm(text);
  if (/(credit|banca|tva|factur|plat[ai]|incasar|cash|eur|ron|lei)/.test(n)) return "Financiar";
  if (/(contract|notar|avocat|clauz|juridic|instant)/.test(n)) return "Contracte";
  if (/(proiect|bloc|santier|apartament|bell|residence)/.test(n)) return "Proiecte";
  if (/(task|nelu|dana|mihaela|echipa)/.test(n)) return "Operational";
  return "Personal";
}

// D2 — intentie strategica / de decizie → (in viitor) Strategy Engine (ChatGPT).
// Detector pur; nu activeaza nimic singur (rutarea o decide decisionEngine + flag).
export function isStrategicTopic(text) {
  const n = norm(text);
  return /(strategie|strategic|ce ai face|ce as face|in locul meu|ce ne facem|merita sa|ar trebui sa|are sens sa|ce ma sfatui|ce (imi )?recomanzi|ce decizie|sa iau decizia|sa vand|sa cumpar|sa investesc|pe ce ma concentrez|pe termen lung|viziune|ce imi propui)/.test(n);
}
