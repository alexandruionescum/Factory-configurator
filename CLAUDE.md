# Factory configurator

Goal: a factory layout configurator (block layout, material flow, transport network, 3D furnishing) built on the
visTABLE workflow in `.claude/skills/vistable-factory-layout/SKILL.md`. Later it should be usable by other people.
Concept, steps and open decisions: `docs/concept.md`. Keep that file up to date when a decision is made.

## Working with the owner
- The owner writes in Romanian; answer in Romanian. They are a factory planner, not a programmer: explain git /
  tooling steps plainly and do them yourself.
- **Pushing to `main` publishes the public site** (GitHub Pages workflow). Work and commit locally; push only when
  the owner says to update the site ("actualizează site-ul"). Show changes with screenshots or the built HTML file.
- Client data (.vtlx, .dwg, .xlsx briefs) never goes into the repo; tests use synthetic data only.
- Real visTABLE tests (opening a .vtlx, mesh audit with the assets folder) only happen on the owner's Windows PC.

## The web app (`app/`)
Vite + React + TypeScript, three.js (3D), exceljs (writes .xlsx), pptxgenjs (PowerPoint), fflate (zip).
UI language: English. Steps: Factory size → Zones → Layout → Flows → 3D → Export.

- `src/lib/model.ts` data model (metres, plan origin SW corner, X east, Y north; visTABLE area type keys).
- `src/lib/layout.ts` arrangement engine: building shapes I / L / U / S as segments, zones in lanes along
  them, grouping, aisles, size proposals, checks. Covered by `src/tests/layout.test.ts`.
- `src/lib/template.ts` brief template (writer and reader together), `briefProject.ts` brief → project,
  `briefImport.ts` any-Excel zone import, `xlsxRead.ts` value-only .xlsx reader (exceljs fails on some files).
- `src/lib/pptx.ts` presentation, `exports.ts` file names, downloads, plan PNG, visTABLE Block Layout Table.
- `src/lib/scene3d.ts` three.js scene shared by the 3D step and the still 3D views on the presentation slide.
- `src/lib/vtlx.ts` + `steps/VistableStep.tsx`: material flows into a Pack and Go. **Hidden** from the menu
  for now (owner's decision); kept and tested, re-enable by adding the step back in `App.tsx`.

Commands (in `app/`): `npm run dev`, `npm run check` (types + lint + unit tests, also run by the publish
workflow), `npm run build` (one self-contained `dist/index.html`, EFESO-branded),
`npm run build:preview` (logo-free `dist-neutral/preview.html` for the claude.ai preview artifact).
Browser smoke test: `cd tests/e2e && npm install && CHROMIUM=/opt/pw-browsers/chromium npm run smoke`.

## Design
EFESO identity (from efeso.com): colour tokens and fonts at the top of `app/src/styles.css`, logo in
`app/src/assets/`, fonts bundled in `app/src/assets/fonts/` (Roboto, Roboto Serif, OFL).
Do not publish EFESO-branded builds as claude.ai artifacts: the preview artifact uses `build:preview`;
the branded build goes to the owner as a file or to the GitHub Pages site.

## Other
- Setup for the visTABLE toolkit scripts: `source tools/setup_libredwg.sh` (libredwg into `.local/`).
- Known audit findings without impact here: image-size (used by pptxgenjs only under Node), uuid in exceljs
  (only v3/v5/v6 with a buffer argument, not used).
