# Drying Oven

A batch drying / curing oven of the metal shop (the demo's factory, 2026-11-18, step 4), after the anodizing
line.

- **The batches:** the line's finished bars (`lineProcessId` - its `recent` list) queue at the oven by their own
  numbers;
  `oven.capacity` of them dry together, each for `oven.dryMin` counted only while the chamber is within
  `oven.readyBelowK` of its set point; a dried batch goes on to QC (counted).
- **The chamber** (`oven` - node type `drying-oven`): the heaters (`heaterKw`) by the band (`setpointC`,
  `tolC`); every load and unload opens the door (`doorLossKwh`), the cold parts take their heat (`partsKwh`).
- **Simulated** oven - its temperature and the heaters' power from the model; a physical one is read and only
  its heaters are written (AUTO).
- **Metrics:** the temperature, the set point, heating, the power, the batches drying (their time left), the
  queue, today (the batches, kWh); **series** `oven.tempC`, `oven.powerKw`; **WEM** - the chamber off its band
  while drying, three batches or more waiting.
