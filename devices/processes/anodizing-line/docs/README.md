# Anodizing Line

A surface-treatment line on flight bars - the first zone of the metal shop (the demo's factory, 2026-11-18).

- **The baths** (node type `process-bath`): each with its role (degrease, etch, desmut, anodize, dye, seal,
  rinse), its volume, its set point and band, its heater and / or cooling coil. A thermostat holds each
  heated or cooled bath in its band; the anodize bath's cooling coil (from the chiller) takes the current's
  heat away.
- **The heat by the price** (`price` - `energyProcessId`: the Energy Field whose metrics' `price.rank` - 0 the
  day's cheapest, 1 the dearest; `cheapRank` 0.3, `dearRank` 0.7): cheap - each heated bath stored to its band's
  top (a cooled one cooled to its bottom), dear - it rides its band's other edge, the heater on as little as the
  band allows; the band is never left. Metrics `price` - `{ mode, rank }`.
- **The hoist** (`hoist`): runs the bars through the recipe (2026-11-20: it comes `leadS` - 10 s - ahead of a bar's end and waits over the bath; the move's timeline `hoist.plan`, each bar's `doneAt` - for the panel) (`recipe` - `{ bath, minutes }` in order): the
  bar that has waited longest for its next bath goes first, one bar a bath; a new bar comes from the load
  station every `line.loadEveryMin` while the first bath is free; a finished bar goes to the unload station
  and its parts are counted. Its travel (`speedMmS`, `pitchMm` between stations), its lift (`liftS`) and the
  drip over the bath it left (`dripS`) take their time.
- **The rectifier** (`rectifier`): on while a bar is in the anodize bath, its current ramped over `rampS` to
  `line.densityAdm2` x the bar's area (`barAreaDm2`); the coating grows about 0.3 µm per A·min/dm²
  (sulfuric acid anodizing, a rule of thumb), the voltage follows the density and the bath's temperature.
- **Simulated** units get their readings from the models (model.ts); a physical unit is read and only the
  outputs are written: the heaters, the coolers, the lift, the rectifier's output (AUTO).
- **The account of the day:** the bars, the parts, the charge (Ah), the electricity - the heaters, the chiller
  (its COP 3.2), the rectifier (90 %), the hoist while it moves.
- **Metrics** - the baths (temperature, set point, level, heating / cooling, the bar in it), the hoist, the
  rectifier, the bars (their bath, the time there, the coating), today; **series** `line.powerKw`,
  `line.rectifierA`, `line.rectifierV`, `line.bath.<node>.tempC`; **WEM** - a bath off its band, a low level.
