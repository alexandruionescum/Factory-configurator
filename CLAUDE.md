# Factory configurator

Goal: a factory layout configurator (block layout, material flow, transport network, 3D furnishing) built on the
visTABLE workflow in `.claude/skills/vistable-factory-layout/SKILL.md`. Later it should be usable by other people.
Concept, steps and open decisions: `docs/concept.md`. Keep that file up to date when a decision is made.

- The owner writes in Romanian; answer in Romanian. They are a factory planner, not a programmer: explain git /
  tooling steps plainly and do them yourself.
- The web app lives in `app/` (Vite + React + TypeScript, three.js, exceljs). UI language: English.
- Design: EFESO identity (from efeso.com): colour tokens and fonts at the top of `app/src/styles.css`, logo in
  `app/src/assets/efeso-logo.svg`, fonts bundled in `app/src/assets/fonts/` (Roboto, Roboto Serif, OFL).
  Do not publish EFESO-branded builds as public claude.ai artifacts; hand the built file to the owner instead.
  `cd app && npm install && npm run build` -> one self-contained `app/dist/index.html`. `npm run dev` for development.
- Setup in a fresh session: `source tools/setup_libredwg.sh` (builds libredwg into `.local/`, sets DWGREAD / DWGWRITE).
- Client data (.vtlx, .dwg, .xlsx briefs) never goes into the repo; only anonymised files in `tests/fixtures/`.
- Real visTABLE tests (opening a .vtlx, mesh audit with the assets folder) only happen on the owner's Windows PC.
