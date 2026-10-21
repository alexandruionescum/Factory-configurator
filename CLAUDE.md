# Factory configurator

Goal: a factory layout configurator (block layout, material flow, transport network, 3D furnishing) built on the
visTABLE workflow in `.claude/skills/vistable-factory-layout/SKILL.md`. Later it should be usable by other people.
Concept, steps and open decisions: `docs/concept.md`. Keep that file up to date when a decision is made.

- The owner writes in Romanian; answer in Romanian. They are a factory planner, not a programmer: explain git /
  tooling steps plainly and do them yourself.
- Setup in a fresh session: `source tools/setup_libredwg.sh` (builds libredwg into `.local/`, sets DWGREAD / DWGWRITE).
- Client data (.vtlx, .dwg, .xlsx briefs) never goes into the repo; only anonymised files in `tests/fixtures/`.
- Real visTABLE tests (opening a .vtlx, mesh audit with the assets folder) only happen on the owner's Windows PC.
