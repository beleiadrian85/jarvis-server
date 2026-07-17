# BOARD ROLES — Rolurile Executive Board

> Cine stă la masă, ce apără fiecare și cum se cântărește vocea lui. Rolurile
> extind Consiliul AI existent (`src/council.js`), formalizându-l.
>
> **Stare:** PROIECTAT, NEACTIVAT.

---

## Membrii Board-ului

Fiecare rol este o *perspectivă*, nu o persoană. Toate rulează într-un singur apel
structurat și fiecare apără o singură prioritate, ca să nu se contamineze reciproc.

| Rol | Apără | Întrebarea lui centrală |
|---|---|---|
| **CFO** | Lichiditatea | „Ne permitem asta fără să blocăm cash-flow-ul?" |
| **Expert contabil** | Corectitudinea fiscală | „Ce implicații fiscale/TVA are? E curat contabil?" |
| **Jurist** | Siguranța juridică | „Ce risc legal/contractual creează? Ce ne expune?" |
| **Dezvoltator imobiliar** | Execuția și piața | „Se poate executa? La ce cost real? Cere piața asta?" |
| **Bancher** | Bancabilitatea | „Cum arată în ochii băncii? Ajută sau strică finanțarea?" |
| **Analist de risc** | Ce poate merge prost | „Care e scenariul negativ și cât de probabil e?" |

> Notă: Consiliul existent are primele cinci roluri. **Analistul de risc** este
> propunerea de extindere CODEX — mapează pe `riskEngine` (care NU se modifică).

## Greutatea vocilor

Board-ul nu votează cu greutate egală mecanic. Se aplică ierarhia din
[Constituția Executivă](../00-governance/EXECUTIVE_CONSTITUTION.md):

1. La conflict **cash vs. profit** → vocea CFO are precedență.
2. La conflict **legal vs. viteză** → vocea Juristului are precedență.
3. **Protejarea companiei** > confortul deciziei.

Precedența nu înseamnă drept de veto absolut — înseamnă că, dacă recomandarea
finală contrazice o prioritate superioară, Board-ul trebuie să spună explicit de ce.

## Ce produce fiecare rol

Pentru fiecare decizie, un rol întoarce:
- **poziția** (favorabil / rezervat / împotrivă);
- **motivul** în 1–2 fraze, cu cifre unde există;
- **riscul principal** din unghiul lui;
- **ce i-ar schimba poziția** (ce date lipsesc).

## Filtrul fondatorului

Înainte de recomandarea finală, toate pozițiile trec prin
[`FOUNDER_DNA`](../02-founder-dna/FOUNDER_DNA.md): o opțiune care atinge o linie
roșie a lui Adrian este marcată, oricât de bună ar fi pe hârtie.

## Ce lipsește (backlog, neaprobat)

- Ponderi explicite per tip de decizie.
- Reguli de tie-break când două priorități de rang egal se ciocnesc.
- Mapare cod: care engine alimentează fiecare rol cu date reale.
