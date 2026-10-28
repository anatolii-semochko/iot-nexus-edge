# Energy Grid (process kind)

CORE Library process kind, loaded automatically in every project
(orchestrator `devices/processes/*/process.ts`, api `.../api.ts`, UI
`.../ui/register.js` - AGENTS.md section 82). The site's **connection to the
public grid**: what flows in and out, what it costs and earns. Public - the
Energy Field and Heating packages depend on it; a project seeds its
instance (the meter node, its devices, one process).

## The meter

A `grid-meter` node (`devices/nodes/grid-meter/` - reference model Janitza
UMG 604-PRO): three `voltage` devices (L1-L3), `frequency`, `power` (kW, **+
import / - export**), two `energy` registers (import, export - kWh, only
grow).

## Every tick

1. The meter's readings, one batch request.
2. A **simulated** meter (Nodes -> Simulated), every
   `simulation.intervalSeconds` (default 60): voltages and frequency around
   the nominal values; the registers integrate the power (as a real meter
   does). The power itself is the site balance's - written by the Energy
   Field (until it exists - 0).
3. The current prices (`/prices/now`, re-read every 5 minutes or at the
   slot's end).
4. **Today's account** in the process's time zone: imported / exported kWh
   (the registers' growth) and their cost / revenue at the slot's prices;
   kept across restarts through the metrics.
5. **WEM**: grid outage (every phase under half the nominal) - an error,
   the process critical; a phase voltage outside nominal +-tolerance
   (EN 50160 - 230 V +-10 %), the frequency outside 50 +-0.2 Hz, the import
   / export over its limit, no purchase price, market data older than 26 h
   (when the market is used) - warnings.
6. Metrics (panel, Dashboard, AI, planners): `phasesV`, `frequencyHz`,
   `powerKw`, `flow` (import / export / none), `outage`, the registers,
   `buyCtKwh`, `sellCtKwh`, `spotEurMwh`, `tariffZone`, `priceSource`,
   `today` (`importKwh`, `exportKwh`, `costEur`, `revenueEur`); time series
   `grid.powerKw` (5-minute means), `grid.buyCtKwh`, `grid.sellCtKwh`.

## Prices (`pricing.ts`, `api.ts`)

- **Buying** - `purchase.mode`:
  - `tariff` - a supplier's time-of-use tariff: `purchase.zones` - `[{ key,
    label?, from: "HH:MM", to: "HH:MM", priceCtKwh }]` (a zone may wrap
    midnight; `to` exclusive);
  - `market` - a **dynamic tariff** (in Germany every supplier offers one
    since 2025, EnWG section 41a): the day-ahead spot price + 
    `purchase.surchargeCtKwh` (grid fees, levies, taxes). The zones still
    label the slots and price them where market data is missing.
- **Selling** - `sale.mode`: `fixed` (`sale.fixedCtKwh`, a feed-in tariff)
  or `market` (direct marketing: spot - `sale.deductionCtKwh`, never below 0
  - a negative price earns nothing).
- **Market data** - `market.biddingZone` (e.g. `DE-LU`), every
  `market.refreshMinutes` (default 60; tomorrow is published ~13:00 CET),
  today and tomorrow: **Energy-Charts** (Fraunhofer ISE; 15-minute slots;
  data Bundesnetzagentur | SMARD.de, CC BY 4.0 - credited where shown;
  `.env` `ENERGY_CHARTS_URL`), **aWATTar** as the fallback (hourly, DE-LU /
  AT; `AWATTAR_URL`). Stored per slot (`energy_prices`, core migration 079;
  14 days kept), the fetch state per zone (`energy_price_fetches`); a
  failed fetch keeps the stored prices, the next try in 15 minutes.
- Routes (scoped to the process):
  - `GET /energy-grid/:processId/prices[?from=&to=]` - slots `{ t, minutes,
    spotEurMwh, buyCtKwh, sellCtKwh, zone }` (default today and tomorrow;
    the market's slots, the tariff's hours after them);
  - `GET .../prices/now` - the current slot;
  - `POST .../prices/refresh` - fetch now (`processes.control`).
- AI tool `energy.prices` - the next hours, now, the cheapest / dearest slot.

## Config (`processes.config`, schema registered)

| Field | Meaning |
|---|---|
| `nodeId`, `voltageL1DeviceId`..`L3`, `frequencyDeviceId`, `powerDeviceId`, `importEnergyDeviceId`, `exportEnergyDeviceId` | the meter (set by the seed) |
| `timeZone` | the site's (tariff zones, "today"); default - the server's |
| `purchase`, `sale`, `market` | above |
| `limits` | `maxImportKw`, `maxExportKw` |
| `quality` | `nominalV` (230), `voltageTolerancePct` (10), `nominalHz` (50), `frequencyToleranceHz` (0.2) |
| `simulation` | `followNominal` (true), `intervalSeconds` (60) |

## UI

- Process panel: grid power with its direction, phases, frequency, buy /
  sell now with the tariff zone, today's balance; today's and tomorrow's
  prices (bars - buy, line - sell, the tariff zones' band, "now").
- Settings -> Configuration: buying (mode, surcharge, tariff zones),
  selling, market, limits, quality, time zone.
- Dashboard component `energyGrid.panel` ("Grid connection").
