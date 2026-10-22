# Factory configurator

Configurator de layout pentru fabrici: brief Excel → zonare (block layout) pe forme I / L / U / S, flux de material,
vedere 3D, export PowerPoint și imagine (exportul visTABLE e pregătit, ascuns deocamdată). Pornește de la metoda de lucru din
[`.claude/skills/vistable-factory-layout/SKILL.md`](.claude/skills/vistable-factory-layout/SKILL.md).

- Aplicația web: `app/` (în engleză), publicată la https://alexandruionescum.github.io/Factory-configurator/
  Pornire locală: `cd app && npm install && npm run dev`; verificări: `npm run check`
- Conceptul și etapele: [`docs/concept.md`](docs/concept.md)
- Cum se folosește toolkit-ul cu Claude: [`docs/toolkit-README.md`](docs/toolkit-README.md)
- Pregătirea mediului (libredwg + Python): `source tools/setup_libredwg.sh`

Datele clienților (.vtlx, .dwg, Excel) nu se pun în acest repo.
