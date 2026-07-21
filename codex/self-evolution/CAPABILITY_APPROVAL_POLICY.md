# CAPABILITY APPROVAL — Politica de Aprobare (§22, §27)

> Sursa de adevăr: `PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL` din
> `src/ceo/evolution/contract.js` + tranzițiile `WAITING_APPROVAL` din `CR_TRANSITIONS`.

## 1. §22 — Politica ÎNGHEȚATĂ

```js
export const PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL = true;
```

Aceasta este o **constantă**, nu un flag:

- **Nu se citește din env.** Nu există variabilă de mediu care să o schimbe.
- **Nu există cale de configurare.** Nicio setare, niciun mod, niciun nivel de evoluție
  actual nu o dezactivează.
- **Este verificată de Guardian și de teste.** Orice diff self-generated care atinge
  această constantă sau fișierul ei (`contract.js` e în `FORBIDDEN_PATHS`) = BLOCK.
- Consecința operațională: codul self-generated ajunge în producție **exclusiv** printr-o
  acțiune explicită a fondatorului. `VALIDATED → WAITING_APPROVAL → APPROVED` — și
  singura mână care apasă `APPROVED` este a lui.

Eventualul nivel 6 (auto-deploy pre-aprobat LOW-RISK) este **viitor**, cere schimbarea
explicită a acestei politici de către fondator și nu poate fi activat de sistem.

## 2. Approval Inbox — cardul de aprobare

Fiecare CR ajuns în `WAITING_APPROVAL` produce un card în Approval Inbox. Cardul conține,
fără ca fondatorul să fie nevoit să deschidă codul:

| Secțiune | Conținut |
|---|---|
| **Ce** | Titlul + capabilitatea cerută, pe scurt (limbaj de business, nu de cod) |
| **De ce** | `problem` + `why_it_matters` + `origin_need_id` — nevoia reală din care provine |
| **Dovada calității** | Porțile §13 toate verzi + verdictul Guardian (`PASS` / `PASS_WITH_CONDITIONS` + condițiile) |
| **Riscuri** | Secțiunea `risk` din raportul de build + `unknowns` declarate |
| **Cost** | Costul buildului + estimarea de operare |
| **Rollback** | Planul de rollback din CR — fără plan, cardul nu se emite |
| **Acțiuni** | APPROVE · REJECT (cu motiv) · pause/kill/disable (vezi §27) |

Un card incomplet nu se prezintă. Aprobarea pe informație parțială nu e aprobare.

## 3. §27 — Acțiunile fondatorului: control total, oricând

Fondatorul nu e doar ultima poartă — are control asupra întregului sistem, în orice moment:

| Acțiune | Efect |
|---|---|
| `pause` | Suspendă un build în curs sau întreaga coadă — reluabil |
| `kill` | Oprește imediat un build în curs (`abort` pe provider) → `FAILED`, auditat |
| `reject` | Respinge un CR în orice stare pre-deploy → `REJECTED`, cu motiv reținut în memorie (§30) |
| `disable` | Oprește complet motorul de self-evolution (kill switch) — nimic nu mai rulează |
| `rollback` | Revine un deploy aprobat → `ROLLED_BACK`, prin planul de rollback din CR |
| `view all` | Vede TOATE CR-urile și build-urile, în orice stare — **no hidden builds** |

**No hidden builds** este invarianta de transparență: nu există build, branch, CR sau
retry care să nu apară în registrul vizibil fondatorului (`ceo:evolution:requests` +
audit). Un build invizibil ar fi, prin definiție, o încălcare §26.

## 4. Ce NU este aprobarea

- **Nu e un rubber stamp**: fondatorul poate cere modificări — CR-ul se întoarce în build
  (prin `REJECTED` + CR nou sau retry sub limita §30), nu se „aprobă cu observații".
- **Nu e delegabilă sistemului**: niciun scor de încredere, istoric bun sau verdict PASS
  nu substituie omul.
- **Nu e permanentă**: aprobarea unui CR nu aprobă categoria lui — următorul CR similar
  trece prin același drum complet.
