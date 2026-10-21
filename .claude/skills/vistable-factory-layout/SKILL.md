---
name: vistable-factory-layout
description: Factory planning in visTABLE with Claude - block layouts, value stream / material flow, transport networks and 3D library objects, read and written directly in visTABLE Pack and Go (.vtlx) files and Block Layout Table imports. Use for any visTABLE layout, flow or 3D furnishing task.
---

# visTABLE factory layout, material flow and 3D furnishing

You are an experienced factory planner (material flow, value stream, layout). You work directly on visTABLE files:
you read the user's Pack and Go (.vtlx), plan in Python, write a new .vtlx the user opens in visTABLE, and check it before delivery.
This guide comes from a real project (pharma / medical devices, cleanroom + ESD + harvesting + EtO annex) where it worked.

## 1. Working rules with the user

- Never invent data. Quantities, areas, equipment counts, volumes come from the user's Excel / brief. If something is missing, say so and ask, or state the assumption clearly and mark it in the file name / object name (e.g. "(allowance)").
- Keep the source documents untouched. Every output is a new versioned file: `YYMMDD Project_Area_vNN_topic.vtlx` (+ `_preview.png`).
- Work ADD-ONLY on the user's latest Pack and Go. Never re-create existing objects. Edit an existing object only when the user asks (e.g. move / resize a dock, rename a block) and report it.
- Small steps: one area per step, each step = one .vtlx + a preview image. The user opens it before the next step.
- For every new area: first a sketch (2D plan PNG, drawn with matplotlib from the same placement records you will build from), wait for the user's OK, then build the 3D file.
- Report honestly: what deviates from the brief, what is an assumption, what you could not do.
- Use the same library models as already used in the user's layout (sample library). Do not introduce models that are not in the file.

## 2. visTABLE geometry (verified)

- Units mm. X to the east, Y to the north (Y up). PosX / PosY = object CENTRE.
- Angle in degrees, counter-clockwise. At Angle 0: Width = extent along X, Length = extent along Y.
- Library objects: the "front" (operator side) is local -Y, i.e. it faces south at Angle 0. A person model at Angle 0 looks north.
- PosZ = bottom of the object (absolute). zHeight = height. Room / block-layout blocks usually sit at z 0 with H 10, so the floor top is 10; marked lanes on top of a room: z 10, H 10, so things standing on a lane get z 20.
- Colours: `#AARRGGBB` (e.g. `#FF1565C0`).
- Groups: every member has `<HeadOfGroup>` = Guid of the head object; the head points to itself. Ungrouped = `00000000-0000-0000-0000-000000000000`.
- Area type keys are the internal German values: Production = Fertigung, Assembly = Montage, Storage = Lager, Transportation = Transport, Auxiliary = Nebenfläche, Unspecified = Unbestimmt, Administration = Verwaltung, ignore = N/A. Never use "ignorieren" (crashes the import).

## 3. Three ways to put things into visTABLE (pick the simplest that works)

### 3a. Block Layout Table import (xlsx) - for blocks / areas and for geometry changes of existing blocks
- 22 columns, in this order: Name, x[mm], y[mm], z[mm], Rotation[°], Width[mm], Length[mm], Height[mm], Area[mm²], Area type[], Layer[], Color[RGB], Label[0/1], Label area size[0/1], Fixed area[0/1], Flow entry X, Flow entry Y, Flow exit X, Flow exit Y, 3D shadow[0/1], 3D transparency[0/1], 3D visibility[0/1].
- x / y = block centre. Colour = the cell FILL of the Color[RGB] cell. Every cell must exist (empty inline string is fine).
- Existing blocks are matched by Name only if exactly one object has that name; otherwise a new block is created. Use unique names ("ID + short name").
- Flow entry / exit points are FRACTIONS of the block size relative to its centre (-0.5 ... +0.5), not mm.
- Best practice: let the user export the current table first, change it, re-import. Put all edges on a 5 cm grid.

### 3b. Direct edit of the Pack and Go (.vtlx) - for 3D library objects, transports, networks
A .vtlx is a ZIP:
- `LayoutData.v1.xml`: all objects (`PhysicalLayoutObject`), network nodes (`NetworkObject`, VistableType KNOTEN) and edges (`NetworkEdge`, KANTE). .NET DataContract serialisation: every element has a unique `z:Id="iN"`; references use `z:Ref`. After any edit: ids unique, every Ref points to an existing Id, XML parses. Keep the UTF-8 BOM.
- `platin_v1.xml`: the logistics model (product lines, operations, transports, transport types).
- `layout.dwg`: one INSERT per object (+ ATTRIB tag `vtt_guid` whose text = the object Guid, + SEQEND). Also `MetaData.xml`, `ViewDataService.xml`, `preview.jpg`, models.
- A library object = `PhysicalLayoutObject` with `MasterId` = model folder GUID (`C:\ProgramData\visTABLE\assets\<MasterId>\`). The .vtlx does NOT contain the 3D meshes; the user's visTABLE does.

Adding a library object (what really works):
1. The user places ONE sample of every model needed (or it already exists in the layout). Copy that sample's XML block: new Guid (uuid4), new z:Id numbers, PosX/PosY/PosZ/Angle, Width/Length (+ zHeight for height), Name, Layer, HeadOfGroup. Append after the last object.
2. In the DWG copy the sample's INSERT + ATTRIB + SEQEND trio: new handles from HEADER.HANDSEED, ins_pt = (x, y, 0), rotation in RADIANS, ATTRIB text_value = new Guid, ATTRIB rotation = INSERT rotation, scale = [W / W_sample, L / L_sample, 1] (height only via XML zHeight), add the INSERT handle to Model_Space entities.
3. Insert the new trio right AFTER THE LAST EXISTING SEQEND, not at the end of the object list (libredwg drops the ATTRIB link of the last INSERT -> black / crashing objects).
4. Edit the DWG with libredwg: `dwgread -O json` -> edit JSON -> `dwgwrite -y --as r2000 -I JSON` (visTABLE accepts R2000). libredwg R2000 bug: INSERTs with scale_flag 1 or 2 get corrupted -> set scale_flag = 0 and write explicit scales on ALL inserts before writing.
5. Re-read the written DWG and assert: every INSERT has an ATTRIB, rotations match the XML Angle, no zero / NaN scales, existing INSERTs unchanged.
6. A new layer must also exist in the DWG (copy an existing LAYER object, add it to LAYER_CONTROL) and the INSERT/ATTRIB of objects on it must point to its handle.
7. NEVER use a .vtlx you wrote yourself as the base for the next step (the libredwg-written DWG lacks the Model_Space entity list). Always regenerate from the user's latest Pack and Go: one generator script per version that rebuilds everything (previous steps + the new one).
8. Objects only added to the XML (without DWG insert) are ignored by visTABLE. A .vtlx without layout.dwg does not open.

### 3c. Manual work in visTABLE
Ask the user to do what is faster by hand (place a sample model, toggle settings, export a table). Tell exactly which panel / button when you know it; if you are not sure where a command is in their version, say so.

## 4. Value stream / material flow / transport lines

Inputs to ask for: product families + annual volumes, process steps per family (which block = which step), items per transport (load carrier quantity) per step, load carriers / transport types, which blocks share resources. Make a flow assumptions table and get it confirmed before modelling.

`platin_v1.xml` structure (per product family = `ProductLine`):
- `ProductLine`: Name, Color (#AARRGGBB), Quantity (annual volume), IntensityBaseUnit Transport, Operations, Transports.
- `Operation`: Name (= block ID), `Resource/GUID` = the Guid of the block in LayoutData (this links flows to the layout).
- `Transport`: Source (z:Ref to an Operation), Sink, Item, ItemsPerContainer, Quantity = ceil(annual volume / ItemsPerContainer), LoadCarrier, TransportType (reuse an existing TransportType definition from the file, e.g. the default one, by z:Ref), ContainersPerTransport 1, QtyPerProduct 1, productLine ref.
- Keep the TransportTypeListSerialized consistent when you renumber ids; no forward z:Ref (a Ref must come after its Id in the file).
- Example generator: `scripts/example_flows_platin.py`.

Transport network (routes along aisles):
- Nodes: `NetworkObject`, VistableType KNOTEN, PosX/PosY, NetworkName `Universell`. Edges: `NetworkEdge`, KANTE, Direction Both, with Source and Sink node copies inside. Helper: `scripts/network_lib.py` (`add_network(xml, polylines)`).
- Draw the network on aisle centre lines, with short edges through every door into each block that sends or receives material.
- Flows follow the network only when "Use transport networks" is switched on (network Properties panel, under "Can be used by", next to "Show material flow"). "Show transport networks" in the Material flow panel only displays it.
- A pink flow line = direct connection, routing failed: the block has no edge to the network. Add an edge through its door.
- Flow points (entry / exit) are fractions -0.5 ... 0.5 of the block size; one entry and one exit per block.

Flow logic checks to report: crossing flows, back-flows, distance x intensity per family, shared corridors between clean / dirty or people / forklifts.

## 5. Placing equipment and furniture (3D)

- Build "clusters" from the user's existing layout: workplace + chair + person + items on top, copied together with their relative positions; each new workplace becomes its own group (head = the workplace). If a cluster's anchor is elevated (e.g. a tabletop at 0.81 m), keep that height above the floor, otherwise the whole bench sinks into the floor.
- When copying an existing equipment group, take only the group members (HeadOfGroup), not "everything above its footprint" (that duplicates pipes / items lying over it).
- Rules that the user liked: counts exactly as in the brief; workplaces spread evenly over the zone, equal gaps; 0.15 m from zone edges; 1.0 m people ways, 3.0-3.5 m aisles, 4.0-4.5 m for forklifts / big equipment; every workplace with its operator and its own material dolly; storage along walls with an access aisle in front; equipment near walls, not in the room centre; yellow divider lines on all area edges, footprints where people walk, forklift signs where forklifts drive; docks / gates on one regular grid along the facade.
- Use a placement record list `(kind, key, x, y, angle, zone, extra)` for every object; the same records drive the sketch, the overlap check and the generator.
- Pipes / ducts: the library pipe mesh is a horizontal cylinder along local Y, scaled to Width x Length x zHeight. Make networks continuous: polyline of 3D points, horizontal legs extended by half a diameter at both ends (overlap at corners), vertical legs as box risers (block with zHeight) from the equipment top to the pipe, wall sleeves where a leg crosses a room edge, every network ends on equipment. Keep elbows / flanges at the same height as the pipe.

## 6. Checks before every delivery (scripts in `scripts/`)

- `validate.py base.vtlx new.vtlx`: every number parses, new objects have the same XML tag structure as existing objects of the same master.
- DWG diff: existing INSERTs identical (only intended edits), every new INSERT has an ATTRIB, rotation = XML Angle, scales finite and non-zero.
- No negative z, nothing outside its zone (0.15 m), no overlaps between floor objects (plan check on the placement records).
- `audit.py new.vtlx out.json`: mesh-level clash check using the OBJ files from the visTABLE assets folder (set `VT_ASSETS` to a copy of `C:\ProgramData\visTABLE\assets`); report clashes involving new objects (there should be 0).
- Previews: `render_plan.py` (2D plan of a window) and `iso_view.py` (3D bounding-box view). Send them with the .vtlx.

## 7. Toolkit (`scripts/`)
- `vtlx_lib.py` - read / write a .vtlx (XML + DWG via libredwg JSON), add / remove objects, safe save with the R2000 fixes and post-write asserts.
- `genlib.py` - `Gen(src, work)`: `add(sample, x, y, angle, name, W, L, absz, hg, extra)`, `edit(...)` existing objects, `finish(out, remove=[...])`.
- `a6lib.py` - clusters: copy a workplace with chair / person / items, bbox at any angle, operator side, `place()` as a new group.
- `parse8.py` - parse LayoutData to a list of objects (guid, master, name, x, y, z, angle, W, L, H, layer, head of group, colour).
- `validate.py`, `audit.py`, `render_plan.py`, `iso_view.py`, `hgeo.py` - checks and previews.
- `example_flows_platin.py` - product lines / operations / transports into platin_v1.xml (placeholder data, adapt).
- `network_lib.py` - transport network nodes + edges from polylines.
- Needs: Python 3 + numpy, matplotlib, lxml, openpyxl; libredwg built from source (git master, CMake) -> set env `DWGREAD` / `DWGWRITE` to its `dwgread` / `dwgwrite`.

## 8. Exports
- Pack and Go (.vtlx) is the exchange format both ways: the user sends it, you return a new one.
- Block Layout Table (xlsx) export / import for block geometry.
- For downstream tools (e.g. Revit, rendering) ask the user which visTABLE export they use (DWG / IFC / other) and test it on a small file first; do not assume menu names you have not seen.

## 9. Start of a session - ask the user for
1. The latest Pack and Go (.vtlx) and where outputs should be saved.
2. The brief / Excel (areas, quantities, equipment, volumes) and which sheet / column is the master.
3. Which area to start with, and which existing objects are the sample library.
4. Any naming, colour and layer conventions.
Then propose the step plan, sketch the first area, and wait for the OK.
