# Pack and Go flow writer tests

`make_synthetic_vtlx.py OUT.vtlx` builds a small **synthetic** Pack and Go shaped like the toolkit describes
(blocks named like the app's example project, one sample flow, a transport type list). It is not a real
visTABLE file: the real check is opening a written file in visTABLE.

`check_flows_output.py IN.vtlx OUT.vtlx` checks a file written by the visTABLE step: other entries unchanged,
BOM kept, XML parses, z:Id unique, every z:Ref defined before use, every Operation GUID is a block in LayoutData.

Steps: load the example project, Auto-arrange, visTABLE step, load the synthetic file, download, run the checker.
