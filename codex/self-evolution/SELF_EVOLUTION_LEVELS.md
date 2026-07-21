# SELF-EVOLUTION LEVELS — Nivelurile 0–6 (§21)

> Sursa de adevăr: `EVOLUTION_LEVELS` + `SELF_EVOLUTION_ACTIVE_LEVEL` din
> `src/ceo/evolution/contract.js`. **Nivel activ: 4.**

## 1. Scara nivelurilor

| Nivel | Denumire | Ce înseamnă |
|---|---|---|
| 0 | *CEO detects limitation* | Sistemul observă că nu poate face ceva de care compania are nevoie și consemnează limitarea, cu dovezi |
| 1 | *CEO creates Capability Request* | Limitarea devine un CR complet (toate câmpurile §3), cu `origin_need_id` și analiza de reuse |
| 2 | *CEO creates architecture/spec* | Sistemul scrie specificația tehnică: intrări, ieșiri, reguli de validare, limite de scriere, acceptance tests |
| 3 | *CEO can invoke Code Agent in sandbox* | Sistemul poate porni un Code Agent (provider generic) în branch-ul `capability/<id>`, sub limitele §28 |
| 4 | *CEO can validate builds* | Sistemul rulează porțile de calitate §13 + Guardian §14 și declară un build `VALIDATED` |
| 5 | *CEO can request production approval* | Sistemul împinge activ CR-uri validate în Approval Inbox și cere aprobare (viitor apropiat) |
| 6 | *future: auto-deploy pre-approved LOW-RISK* | Viitor îndepărtat: deploy automat pentru categorii pre-aprobate explicit de fondator, LOW-RISK — cere schimbarea politicii §22 de către fondator |

Fiecare nivel îl **conține** pe cel anterior. Nivelurile nu sunt un scor de merit, ci un
perimetru de permisiuni: nivelul definește ce are voie sistemul să facă **fără** o
intervenție umană suplimentară.

## 2. Nivelul activ: 4 — „detectează + specifică + construiește în sandbox + validează"

Ținta actuală, pe scurt: sistemul duce singur un CR de la `DETECTED` până la `VALIDATED`.
Tot ce urmează după `VALIDATED` este teritoriu uman.

## 3. Ce NU poate face nivelul 4 (explicit)

- **NU deploiază.** Tranziția `APPROVED → DEPLOYED` nu este executată autonom; deployul
  este operațiune umană.
- **NU cere singur aprobarea (încă).** Împingerea activă în Approval Inbox e nivelul 5;
  la 4, CR-urile validate stau în `WAITING_APPROVAL` și sunt vizibile, nu insistente.
- **NU face merge în `main`** și nu atinge producția sub nicio formă (`CODE_AGENT_CANNOT`).
- **NU își schimbă propriul nivel.** `SELF_EVOLUTION_ACTIVE_LEVEL` e constantă în
  `contract.js` (fișier în `FORBIDDEN_PATHS`) — promovarea între niveluri e decizie a
  fondatorului, prin schimbare de cod făcută de om.
- **NU ocolește §22**: chiar cu toate porțile verzi, fără acțiunea fondatorului nimic
  nu ajunge în producție.

## 4. Regula de promovare

Trecerea la un nivel superior cere, cumulativ:

1. Dovadă de funcționare corectă la nivelul curent (istoricul CR-urilor + memoria §30–31,
   fără incidente nerezolvate);
2. Testele de acceptanță A–O verzi (vezi `SELF_EVOLUTION_ACCEPTANCE_TESTS.md`);
3. Decizia explicită a fondatorului, implementată ca schimbare de cod de către un om.

Sistemul poate cel mult **argumenta** promovarea cu date. Nu o poate executa —
auto-promovarea ar fi exact pattern-ul interzis de §26.
