// XLSX PARSER — teste pentru capabilitatea construita (parser pur JS, fara dependente).
// Construieste IN TEST un XLSX minimal REAL (arhiva ZIP corecta cu CRC32)
// si verifica parsarea, integrarea cu registry si schema discovery.
// node test/xlsxParser.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { deflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";

const { parseXlsx, cellRefToIndex, decodeXmlEntities } = await import("../src/ceo/evolution/xlsxParser.js");
const { selectParser, listParsers } = await import("../src/ceo/evolution/parserRegistry.js");
const { discoverSchema, proposeMapping } = await import("../src/ceo/evolution/schemaDiscovery.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── Helper: CRC32 standard (polinom 0xEDB88320) ─────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Helper: construieste o arhiva ZIP corecta din intrari {name, text} ──
function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, text } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const comp = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // semnatura local header
    local.writeUInt16LE(20, 4);         // versiune necesara
    local.writeUInt16LE(0, 6);          // flags
    local.writeUInt16LE(8, 8);          // metoda: DEFLATE
    local.writeUInt16LE(0, 10);         // ora (dummy determinist)
    local.writeUInt16LE(0x21, 12);      // data (dummy determinist)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);         // extra len
    localParts.push(local, nameBuf, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // semnatura central directory
    central.writeUInt16LE(20, 4);          // made by
    central.writeUInt16LE(20, 6);          // versiune necesara
    central.writeUInt16LE(0, 8);           // flags
    central.writeUInt16LE(8, 10);          // metoda
    central.writeUInt16LE(0, 12);          // ora
    central.writeUInt16LE(0x21, 14);       // data
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);          // extra
    central.writeUInt16LE(0, 32);          // comentariu
    central.writeUInt16LE(0, 34);          // disc
    central.writeUInt16LE(0, 36);          // atribute interne
    central.writeUInt32LE(0, 38);          // atribute externe
    central.writeUInt32LE(offset, 42);     // offset local header
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // semnatura EOCD
  eocd.writeUInt16LE(0, 4);                     // disc
  eocd.writeUInt16LE(0, 6);                     // disc CD
  eocd.writeUInt16LE(entries.length, 8);        // intrari pe disc
  eocd.writeUInt16LE(entries.length, 10);       // intrari total
  eocd.writeUInt32LE(centralBuf.length, 12);    // dimensiune CD
  eocd.writeUInt32LE(offset, 16);               // offset CD
  eocd.writeUInt16LE(0, 20);                    // comentariu
  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// ── Fixture: XLSX minimal REAL cu tabelul "Situatie clienti" ────────────
// Header: Client | Factura | Suma | Incasat | Rest
// Rand 2: Alfa Serv | F-101 | 1200.5 | 700 | 500.5
// Rand 3: Beta Grup | F-102 | 2500 | (celula D3 LIPSA → null) | 2500
// Rand 4: TOTAL | | 3700.5 | 700 | 3000.5
const SHARED = ["Client", "Factura", "Suma", "Incasat", "Rest", "Alfa Serv", "F-101", "Beta Grup", "F-102", "TOTAL"];
const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${SHARED.length}" uniqueCount="${SHARED.length}">
${SHARED.map((s) => `<si><t>${s}</t></si>`).join("\n")}
</sst>`;
const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Situatie clienti" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;
// atribute in ordine variata + celule self-closing ca in fisiere reale
const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c t="s" r="B1"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>
<row r="2"><c r="A2" t="s"><v>5</v></c><c r="B2" t="s"><v>6</v></c><c r="C2"><v>1200.5</v></c><c r="D2"><v>700</v></c><c r="E2"><v>500.5</v></c></row>
<row r="3"><c r="A3" t="s"><v>7</v></c><c r="B3" t="s"><v>8</v></c><c r="C3"><v>2500</v></c><c r="E3"><v>2500</v></c></row>
<row r="4"><c r="A4" t="s"><v>9</v></c><c r="C4"><v>3700.5</v></c><c r="D4"><v>700</v></c><c r="E4"><v>3000.5</v></c></row>
</sheetData>
</worksheet>`;
const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
</Types>`;

const xlsxBuf = makeZip([
  { name: "[Content_Types].xml", text: contentTypesXml },
  { name: "xl/workbook.xml", text: workbookXml },
  { name: "xl/_rels/workbook.xml.rels", text: relsXml },
  { name: "xl/sharedStrings.xml", text: sharedStringsXml },
  { name: "xl/worksheets/sheet1.xml", text: sheetXml },
]);

// ── 1. Parsare de baza ──────────────────────────────────────────────────
const parsed = parseXlsx(xlsxBuf);
ok(parsed.ok === true, "1. parseXlsx pe XLSX real construit programatic → ok:true");
ok(parsed.sheet_name === "Situatie clienti", `2. numele sheet-ului din workbook.xml ('${parsed.sheet_name}')`);
ok(Array.isArray(parsed.sheets) && parsed.sheets.length === 1 && parsed.sheets[0] === "Situatie clienti", "3. lista sheets corecta");
ok(Array.isArray(parsed.rows) && parsed.rows.length === 4, `4. patru randuri parsate (${parsed.rows ? parsed.rows.length : 0})`);
ok(JSON.stringify(parsed.rows[0]) === JSON.stringify(["Client", "Factura", "Suma", "Incasat", "Rest"]), "5. header corect din sharedStrings");

// ── 2. Valori si tipuri ─────────────────────────────────────────────────
ok(parsed.rows[1][0] === "Alfa Serv" && parsed.rows[1][1] === "F-101", "6. stringuri partajate rezolvate corect pe randul de date");
ok(parsed.rows[1][2] === 1200.5 && parsed.rows[1][3] === 700 && parsed.rows[1][4] === 500.5, "7. valori numerice corecte (Number, nu string)");
ok(parsed.rows[2][3] === null, "8. celula LIPSA (D3) → null, NU 0 (missing != zero)");
ok(parsed.rows[2][2] === 2500 && parsed.rows[2][4] === 2500, "9. celulele din jurul golului raman aliniate pe index de coloana");
ok(parsed.rows[3][0] === "TOTAL" && parsed.rows[3][1] === null && parsed.rows[3][2] === 3700.5, "10. rand TOTAL: B4 lipsa → null, suma corecta");
ok(parsed.meta.shared_strings === SHARED.length && parsed.meta.cells === 18, `11. meta: shared_strings=${parsed.meta.shared_strings}, cells=${parsed.meta.cells}`);
ok(Array.isArray(parsed.meta.date_candidates) && parsed.meta.date_candidates.length === 0, "12. fara styles.xml → date_candidates gol (best effort, fara inventii)");
ok(parsed.meta.truncated === false, "13. sub limita de randuri → truncated=false");

// ── 3. Robustete: fisier corupt / gunoaie → { ok:false } fara throw ─────
let threw = false;
let bad1, bad2, bad3, bad4;
try {
  bad1 = parseXlsx(Buffer.from("acesta nu este un zip, doar text simplu"));
  bad2 = parseXlsx(Buffer.alloc(0));
  bad3 = parseXlsx(xlsxBuf.subarray(0, 40)); // arhiva trunchiata
  bad4 = parseXlsx(null);
} catch {
  threw = true;
}
ok(!threw, "14. niciun throw pe input corupt (contract: NU arunca niciodata)");
ok(bad1 && bad1.ok === false && typeof bad1.error === "string", "15. text simplu → { ok:false, error }");
ok(bad2 && bad2.ok === false && bad3 && bad3.ok === false && bad4 && bad4.ok === false, "16. buffer gol / arhiva trunchiata / null → { ok:false }");

// ── 4. Utilitare deterministe ───────────────────────────────────────────
const r1 = cellRefToIndex("A1");
const r2 = cellRefToIndex("BC23");
ok(r1 && r1.col === 0 && r1.row === 0 && r2 && r2.col === 54 && r2.row === 22, "17. referinta celulei A1/BC23 → indexi corecti");
ok(decodeXmlEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#65;") === 'a & b <c> "d" A', "18. entitatile XML de baza decodate");

// ── 5. Integrare registry: XLSX e acum DISPONIBIL ───────────────────────
const xlsxEntry = listParsers().find((p) => p.format === "XLSX");
ok(xlsxEntry && xlsxEntry.available === true, "19. listParsers: XLSX available:true (capabilitatea a fost construita)");
const parser = selectParser({ filename: "situatie.xlsx" });
ok(parser && parser.format === "XLSX" && parser.available === true, "20. selectParser('situatie.xlsx') → parserul XLSX disponibil");

const parsedViaRegistry = parser.parse({ data: xlsxBuf, filename: "situatie.xlsx" });
ok(parsedViaRegistry.ok === true, "21. parser.parse cu Buffer → ok");
const parsedViaB64 = parser.parse({ data: xlsxBuf.toString("base64"), filename: "situatie.xlsx" });
ok(parsedViaB64.ok === true && parsedViaB64.rows[1][0] === "Alfa Serv", "22. parser.parse cu string base64 → ok (conversie automata)");
const val = parser.validate(parsedViaRegistry);
ok(val.valid === true, "23. validate pe rezultat curat → valid:true");
const conf = parser.confidence(parsedViaRegistry);
ok(typeof conf === "number" && conf >= 60 && conf <= 100, `24. confidence pe rezultat curat in banda inalta (${conf})`);
ok(parser.confidence({ ok: false, error: "x" }) === 0 && parser.parse({ data: 12345 }).ok === false, "25. confidence 0 pe esec; tip nesuportat → ok:false");

const norm = parser.normalize(parsedViaRegistry);
ok(norm.columns.length === 5 && norm.rows.length === 4, "26. normalize → 5 coloane, 4 randuri");
ok(norm.rows[2][3] === null && norm.rows.every((r) => r.length === 5), "27. normalize pastreaza null pe goluri si aliniaza latimile (padding cu null, nu 0)");

// ── 6. Integrare schema discovery: gaseste client si amount ─────────────
const schema = discoverSchema({ rows: norm.rows });
ok(schema.header && schema.header.row_index === 0, "28. discoverSchema gaseste randul-antet (Client/Factura/Suma/...)");
const { mapping, human_mapping_required } = proposeMapping({ schema, targetFields: ["client", "invoice", "amount", "collected", "remaining"] });
const mClient = mapping.find((m) => m.target === "client");
const mAmount = mapping.find((m) => m.target === "amount");
ok(mClient && mClient.column_index === 0 && mClient.confidence >= 60, `29. mapare client → coloana 0 (conf ${mClient ? mClient.confidence : "?"})`);
ok(mAmount && mAmount.column_index === 2 && mAmount.confidence >= 60, `30. mapare amount → coloana 2 'Suma' (conf ${mAmount ? mAmount.confidence : "?"})`);
ok(human_mapping_required === false, "31. campurile obligatorii mapate cu incredere → fara om in bucla");

// ── REGRESII din review-ul adversarial (6 constatari) ───────────────────
// #4: celule fara atribut 'r' din randuri DIFERITE nu se prabusesc pe rand 0.
const sheetNoRef = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>
<row r="2"><c t="s"><v>5</v></c><c><v>1200.5</v></c></row>
</sheetData></worksheet>`;
const bufNoRef = makeZip([
  { name: "[Content_Types].xml", text: contentTypesXml }, { name: "xl/workbook.xml", text: workbookXml },
  { name: "xl/_rels/workbook.xml.rels", text: relsXml }, { name: "xl/sharedStrings.xml", text: sharedStringsXml },
  { name: "xl/worksheets/sheet1.xml", text: sheetNoRef },
]);
const pNoRef = parseXlsx(bufNoRef);
ok(pNoRef.ok && pNoRef.rows.length === 2, `#4. randuri fara 'r' pe celule → 2 randuri distincte (a fost ${pNoRef.rows?.length})`);
ok(pNoRef.rows[0][0] === "Client" && pNoRef.rows[1][0] === "Alfa Serv", "#4. celulele raman pe randul lor, nu se prabusesc pe rand 0");

// #5 + #6: <v></v> gol → null (numeric NU 0; shared NU sharedStrings[0]).
const sheetEmpty = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1"><v></v></c><c r="B1" t="s"><v></v></c><c r="C1"><v>42</v></c></row>
</sheetData></worksheet>`;
const bufEmpty = makeZip([
  { name: "[Content_Types].xml", text: contentTypesXml }, { name: "xl/workbook.xml", text: workbookXml },
  { name: "xl/_rels/workbook.xml.rels", text: relsXml }, { name: "xl/sharedStrings.xml", text: sharedStringsXml },
  { name: "xl/worksheets/sheet1.xml", text: sheetEmpty },
]);
const pEmpty = parseXlsx(bufEmpty);
ok(pEmpty.ok && pEmpty.rows[0][0] === null, "#5. celula numerica <v></v> gol → null, NU 0");
ok(pEmpty.rows[0][1] === null, "#6. celula shared <v></v> gol → null, NU sharedStrings[0]");
ok(pEmpty.rows[0][2] === 42, "#5. celula numerica reala ramane corecta langa cea goala");

// #1: zip bomb (uncompSize declarat imens) → {ok:false}, procesul NU moare.
const bomb = (() => {
  const nb = Buffer.from("xl/worksheets/sheet1.xml"), body = Buffer.from("<x/>");
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(0, 8);
  lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(body.length, 22); lh.writeUInt16LE(nb.length, 26);
  const local = Buffer.concat([lh, nb, body]);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(0, 10);
  cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(0x7ffffffe, 24); // uncompSize FALS urias
  cd.writeUInt16LE(nb.length, 28); cd.writeUInt32LE(0, 42);
  const cdFull = Buffer.concat([cd, nb]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdFull.length, 12); eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cdFull, eocd]);
})();
const pBomb = parseXlsx(bomb);
ok(pBomb.ok === false && /BOMB|buget/i.test(pBomb.error || ""), "#1. zip bomb (uncompSize urias) → {ok:false} elegant, procesul traieste");

// ── Verdict ─────────────────────────────────────────────────────────────
console.log(failed === 0 ? "\nTOATE TESTELE XLSX AU TRECUT" : `\n${failed} TESTE PICATE`);
process.exit(failed === 0 ? 0 : 1);
