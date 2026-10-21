# Concept: configurator de layout pentru fabrici

Stare: ciornă (2026-10-21). Se actualizează la fiecare decizie.

## Ideea

Pașii pe care azi un planificator îi face cu Claude (ghidul `vistable-factory-layout`) devin module fixe într-o
aplicație pe care o poate folosi oricine: brief → zonare → fluxuri → rețea → echipare → verificări → export.

## Module

| Pas din ghid | Modul | Rezultat |
|---|---|---|
| Brief / Excel (§9) | Input | brief citit, listă cu ce lipsește |
| Block layout (§3a) | Generator de blocuri + editor 2D | blocuri pe grilă de 5 cm, tipuri de suprafață visTABLE |
| Flux de valoare (§4) | Fluxuri | matrice de intensitate, distanță × intensitate, încrucișări, fluxuri înapoi |
| Rețea de transport (§4) | Culoare și rețea | culoare pe axe, conexiune prin ușa fiecărui bloc |
| Echipare 3D (§5) | Reguli de amplasare | posturi, culoare 1,0 / 3,0–3,5 / 4,0–4,5 m, depozitare pe pereți |
| Verificări (§6) | Validare | suprapuneri, ieșiri din zonă, z negativ, coliziuni |
| Exporturi (§8) | Export | Block Layout xlsx, .vtlx, plan PNG, raport cu abateri și presupuneri |

Miezul este un model de date propriu (lista de „placement records” din ghid). visTABLE este un export, nu baza:
așa se pot adăuga mai târziu DXF / IFC / alte programe.

## Etape propuse

1. **MVP:** Excel brief → propunere de blocuri + analiză de fluxuri → editor 2D → export Block Layout Table (xlsx,
   import oficial în visTABLE) + plan PNG + raport.
2. Citire .vtlx (afișarea layout-ului existent în aplicație).
3. Scriere .vtlx: rețele de transport, fluxuri (platin_v1.xml).
4. Echipare 3D cu modele din biblioteca utilizatorului.
5. Acces pentru alți utilizatori: conturi, izolare între clienți, ștergerea datelor.

## Riscuri

- Formatul .vtlx nu e documentat oficial: scrierea directă poate fi afectată de versiuni noi de visTABLE.
  Importul Block Layout Table (xlsx) este funcție oficială, deci calea sigură pentru MVP.
- Termenii de licență plavis (visTABLE) trebuie verificați înainte de o versiune publică; posibil parteneriat.
- Modelele 3D sunt ale utilizatorului (folderul de assets visTABLE); aplicația lucrează doar cu ID-urile lor.
- libredwg este GPL-3: ok ca serviciu web; o aplicație desktop distribuită ar avea obligații GPL.
- Layout-urile clienților sunt date sensibile.

## Decizii deschise

- Cine sunt utilizatorii: planificatori cu licență visTABLE, sau și oameni fără visTABLE?
- Aplicație web sau desktop?
- Fișiere reale de test (Excel brief + .vtlx, anonimizate).
