# visTABLE + Claude toolkit (for Simon)

What it is: the working method and the Python helpers Claude used on a previous factory project to build visTABLE layouts,
material / value flows, transport networks and 3D furnishing directly in Pack and Go files.

## How to set it up (pick one)
1. **As a skill (recommended):** zip this folder (`vistable_claude_toolkit`, with `SKILL.md` at its root) and upload it in Claude -> Settings -> Capabilities -> Skills. Claude then loads it automatically for visTABLE work.
2. **As a Claude Project:** create a project, paste the text of `SKILL.md` (without the first 4 lines) into the project instructions and upload the `scripts/` files as project files.

Claude needs a Python environment (Cowork / Claude Code) to run the scripts. libredwg must be built once (Claude can do it: clone the libredwg git repository, build with CMake, then set `DWGREAD` / `DWGWRITE`).

## First message to Claude (copy, then fill in)
```
We work in visTABLE on project <NAME>. Use the vistable-factory-layout method.
- Latest Pack and Go: <file>. Save all outputs to: <folder>.
- Brief / master data: <Excel file>, sheet <...>; quantities come only from there.
- Goal of this session: <e.g. block layout from the brief / value stream + material flow for families A, B / transport network on the aisles / 3D furnishing of zone X>.
- Sample library: the models already placed in <area> (I place one sample of any new model myself).
Start by reading the files, list what you found and what is missing, propose the step plan, then draw a sketch of the first step. Do not generate the .vtlx before I confirm the sketch.
```

## Good habits that saved time
- One step = one .vtlx + preview; sketch first, 3D after the OK.
- Always build from the latest Pack and Go exported by visTABLE, never from a file Claude wrote.
- Ask Claude to report deviations from the brief and assumptions in every delivery.
