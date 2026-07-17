# REGULA ZERO

> Prima regulă a CODEX. Se aplică înaintea oricărei alte reguli, oricărui engine
> și oricărei linii de cod. Dacă Regula Zero nu este satisfăcută, nu se construiește
> nimic — indiferent cât de bună pare ideea.

---

## Enunțul

**Nicio funcționalitate nu se construiește înainte să fie clar:**

1. **ce problemă rezolvă;**
2. **pentru cine;**
3. **ce valoare măsurabilă produce;**
4. **ce impact are asupra arhitecturii;**
5. **dacă poate fi reutilizată;**
6. **care sunt riscurile;**
7. **cine aprobă implementarea.**

---

## De ce există

Sistemele mor din funcționalități adăugate „pentru că se putea", nu din lipsă de
funcționalități. Regula Zero forțează ca fiecare adăugire să înceapă de la o
problemă reală, măsurabilă, aprobată — nu de la o soluție care își caută problema.

Regula Zero este poarta de intrare în [`CHANGE_CONTROL`](../15-security-engine/CHANGE_CONTROL.md).
Nicio propunere nu intră în flux fără să răspundă la cele șapte întrebări.

## Formular de verificare (obligatoriu pentru orice propunere)

Copiază și completează înainte de a propune orice funcționalitate nouă:

```
FUNCȚIONALITATE PROPUSĂ: _______________________________________

1. PROBLEMA        — ce problemă concretă rezolvă?
2. PENTRU CINE     — cine e beneficiarul (Adrian / echipă / client / sistem)?
3. VALOARE         — ce câștig măsurabil produce? (timp, bani, erori evitate, risc redus)
4. IMPACT ARHITECT.— ce atinge? (module, DB, integrări, flag-uri, non-regresie?)
5. REUTILIZARE     — poate fi refolosită? sau dublează ceva existent?
6. RISCURI         — ce poate merge prost? cost? ireversibilitate?
7. APROBARE        — cine aprobă? (implicit: Adrian Belei)
```

## Reguli de respingere

O propunere se **respinge automat** (nu intră în Change Control) dacă:

- răspunsul la (1) este „ar fi frumos să avem" fără o problemă concretă;
- răspunsul la (3) nu poate fi măsurat;
- (5) arată că dublează o funcționalitate existentă fără a o îmbunătăți;
- (6) conține un risc ireversibil fără plan de rollback;
- (7) nu are aprobarea lui Adrian pentru zone cu efect (plăți, permisiuni, DB,
  integrări, deploy).

## Relația cu funcționalitatea existentă

Funcționalitatea deja livrată în `src/` **nu** se re-justifică retroactiv prin
Regula Zero. Regula Zero se aplică de acum înainte, pentru tot ce este nou sau
pentru orice migrare a comportamentului existent sub guvernanța CODEX.
