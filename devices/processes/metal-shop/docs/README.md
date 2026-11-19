# Metal Shop

The metal shop of the demo's factory (2026-11-17..19): its panel and its summary process.

- **The panel** (`metalShop.panel`, ui/): the shop on one plan (a frontal 3D picture), each zone's card with its
  live figures, each zone's popup (its own picture with the figures over the machines, the readings, a table,
  today's charts); the shop's sums and the bars in work.
- **The summary process** (`metal-shop`): reads the shop's processes (`machiningProcessId`, `lineProcessId`,
  `ovenProcessId`, `qcProcessId`, `utilitiesProcessId`) and the grid (`gridProcessId` - its `buyCtKwh`):
  - the electricity now - each process's power, the line's chiller share (`chillerKw`) taken out when the
    utilities run their own chiller;
  - today's kWh and € (the price integrated over the day);
  - the bars in work - on the line, in the oven, at QC - each with its part (the machining's job that made it),
    its progress over the route (the line 70 %, the oven 15 %, QC 15 %) and the time it is ready;
  - **series** `shop.powerKw`, `shop.eurToday`.

The zones' own processes: `machining`, `anodizing-line`, `drying-oven`, `quality-control`, `shop-utilities`.
