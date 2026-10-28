/**
 * "energy-grid" process kind - the site's connection to the public grid
 * (CORE Library package devices/processes/energy-grid/; the Energy Field
 * and Heating packages depend on it). One process per connection point,
 * reading its meter (node type `grid-meter`: three phase voltages, the
 * frequency, the signed active power - + import / - export - and the
 * import / export registers).
 *
 * Every tick:
 *  - the meter's readings (one batch request);
 *  - a simulated meter: every `simulation.intervalSeconds` (default 60) the
 *    voltages and the frequency around their nominal values, and the
 *    registers integrating the power (what a real meter does itself); the
 *    power is written by whoever owns the site's balance (Energy Field);
 *  - the current prices (api.ts `/prices/now`, re-read every
 *    PRICE_REFRESH_MS): bought / sold ct/kWh, the tariff zone;
 *  - today's account in the process's own time zone: imported / exported
 *    kWh from the registers' growth, their cost / revenue at the slot's
 *    prices (kept across restarts through the metrics);
 *  - WEM: grid outage (all phases below half the nominal) - an error,
 *    critical; a phase voltage / the frequency outside the tolerance
 *    (EN 50160: 230 V +-10 %, 50 Hz +-0.2 Hz by default), the import /
 *    export over its limit, no price, stale market data - warnings;
 *  - metrics (the panel, the AI Assistant, the planners) and loggable
 *    values (`metrics.values` - the time series).
 */

const PRICE_REFRESH_MS = 5 * 60_000;
const DEFAULT_SIM_SECONDS = 60;
// market prices older than this (or a failing fetch) - a warning
const MARKET_STALE_MS = 26 * 3_600_000;

interface Account {
  date: string; // YYYY-MM-DD in the process's time zone
  importKwh: number;
  exportKwh: number;
  costEur: number;
  revenueEur: number;
}

interface State {
  lastSim: number;
  simImport: number | null;
  simExport: number | null;
  price: { at: number; slot: any; source: string | null; fetchedAt: string | null; error: string | null } | null;
  lastImport: number | null;
  lastExport: number | null;
  account: Account | null;
  declared: boolean;
}

const localDate = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the orchestrator and imports nothing from it
export default function registerEnergyGrid(register: any, { apiClient, logger }: any): void {
  const states = new Map<number, State>();
  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  register("energy-grid", async (process: any) => {
    const c = process.config ?? {};
    const phaseIds: number[] = [c.voltageL1DeviceId, c.voltageL2DeviceId, c.voltageL3DeviceId].filter((id) => typeof id === "number");
    const ids = [...phaseIds, c.frequencyDeviceId, c.powerDeviceId, c.importEnergyDeviceId, c.exportEnergyDeviceId].filter((id): id is number => typeof id === "number");
    if (c.nodeId === undefined || c.powerDeviceId === undefined) {
      logger.warn({ processId: process.id }, "energy-grid process is missing nodeId / powerDeviceId");
      return;
    }
    const now = Date.now();
    const timeZone = c.timeZone || systemTimeZone;
    let st = states.get(process.id);
    if (!st) {
      st = { lastSim: 0, simImport: null, simExport: null, price: null, lastImport: null, lastExport: null, account: null, declared: false };
      // today's account survives a restart through the stored metrics
      const saved = process.metrics?.today as Account | undefined;
      if (saved?.date === localDate(now, timeZone)) st.account = { ...saved };
      states.set(process.id, st);
    }

    const { values } = await apiClient.getDeviceValues(ids);
    const read = (id: number | undefined): number | null => {
      if (typeof id !== "number") return null;
      const v = values?.[id];
      const n = v && v.source !== "error" ? Number(v.value) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    let phases = phaseIds.map((id) => read(id));
    let frequency = read(c.frequencyDeviceId);
    const power = read(c.powerDeviceId);
    let imported = read(c.importEnergyDeviceId);
    let exported = read(c.exportEnergyDeviceId);

    const nominalV = c.quality?.nominalV ?? 230;
    const nominalHz = c.quality?.nominalHz ?? 50;

    // --- a simulated meter ---------------------------------------------------
    if (c.simulation?.followNominal !== false && now - st.lastSim >= (c.simulation?.intervalSeconds ?? DEFAULT_SIM_SECONDS) * 1000) {
      const node = (await apiClient.listNodes()).find((n: { id: number }) => n.id === c.nodeId);
      if (node?.simulated) {
        const dtH = st.lastSim ? (now - st.lastSim) / 3_600_000 : 0;
        const p = power ?? 0;
        st.simImport = (st.simImport ?? imported ?? 0) + Math.max(0, p) * dtH;
        st.simExport = (st.simExport ?? exported ?? 0) + Math.max(0, -p) * dtH;
        const jitter = (spread: number) => (Math.random() * 2 - 1) * spread;
        const writes: { id: number; value: number }[] = phaseIds.map((id) => ({ id, value: Math.round((nominalV + jitter(2.5)) * 10) / 10 }));
        if (typeof c.frequencyDeviceId === "number") writes.push({ id: c.frequencyDeviceId, value: Math.round((nominalHz + jitter(0.03)) * 1000) / 1000 });
        if (typeof c.importEnergyDeviceId === "number") writes.push({ id: c.importEnergyDeviceId, value: Math.round(st.simImport * 1000) / 1000 });
        if (typeof c.exportEnergyDeviceId === "number") writes.push({ id: c.exportEnergyDeviceId, value: Math.round(st.simExport * 1000) / 1000 });
        await apiClient.simulateDevices(writes);
        phases = writes.slice(0, phaseIds.length).map((w) => w.value);
        if (typeof c.frequencyDeviceId === "number") frequency = writes[phaseIds.length].value;
        imported = st.simImport;
        exported = st.simExport;
      } else {
        st.simImport = null;
        st.simExport = null;
      }
      st.lastSim = now;
    }

    // --- prices --------------------------------------------------------------
    if (!st.price || now - st.price.at >= PRICE_REFRESH_MS || (st.price.slot && now >= st.price.slot.t + st.price.slot.minutes * 60_000)) {
      try {
        const p = await apiClient.request(`/energy-grid/${process.id}/prices/now`);
        st.price = { at: now, slot: p.slot ?? null, source: p.source ?? null, fetchedAt: p.fetchedAt ?? null, error: p.error ?? null };
      } catch (err) {
        logger.warn({ processId: process.id, err }, "energy-grid: prices unavailable");
        st.price = { at: now, slot: null, source: null, fetchedAt: null, error: String(err) };
      }
    }
    const slot = st.price?.slot ?? null;

    // --- today's account -----------------------------------------------------
    const today = localDate(now, timeZone);
    if (!st.account || st.account.date !== today) st.account = { date: today, importKwh: 0, exportKwh: 0, costEur: 0, revenueEur: 0 };
    const grew = (value: number | null, last: number | null) => (value !== null && last !== null && value >= last ? value - last : 0);
    const dImport = grew(imported, st.lastImport);
    const dExport = grew(exported, st.lastExport);
    st.lastImport = imported ?? st.lastImport;
    st.lastExport = exported ?? st.lastExport;
    const acc = st.account;
    acc.importKwh += dImport;
    acc.exportKwh += dExport;
    if (slot?.buyCtKwh != null) acc.costEur += (dImport * slot.buyCtKwh) / 100;
    if (slot?.sellCtKwh != null) acc.revenueEur += (dExport * slot.sellCtKwh) / 100;

    // --- WEM -----------------------------------------------------------------
    const tolV = (nominalV * (c.quality?.voltageTolerancePct ?? 10)) / 100;
    const tolHz = c.quality?.frequencyToleranceHz ?? 0.2;
    const measured = phases.filter((v): v is number => v !== null);
    const outage = measured.length > 0 && measured.every((v) => v < nominalV / 2);
    const errors = outage ? [{ code: "grid_outage", level: 1, text: "Grid outage - no voltage on any phase" }] : [];
    const warnings: { code: string; level: number; text: string }[] = [];
    if (!outage) {
      phases.forEach((v, i) => {
        if (v !== null && Math.abs(v - nominalV) > tolV)
          warnings.push({ code: `voltage_l${i + 1}`, level: 1, text: `Phase L${i + 1} at ${v.toFixed(1)} V - outside ${nominalV} V +-${c.quality?.voltageTolerancePct ?? 10} %` });
      });
      if (frequency !== null && Math.abs(frequency - nominalHz) > tolHz)
        warnings.push({ code: "frequency", level: 1, text: `Grid frequency ${frequency.toFixed(2)} Hz - outside ${nominalHz} +-${tolHz} Hz` });
    }
    if (power !== null && c.limits?.maxImportKw != null && power > c.limits.maxImportKw)
      warnings.push({ code: "import_limit", level: 1, text: `Import ${power.toFixed(1)} kW - over the ${c.limits.maxImportKw} kW limit` });
    if (power !== null && c.limits?.maxExportKw != null && -power > c.limits.maxExportKw)
      warnings.push({ code: "export_limit", level: 1, text: `Export ${(-power).toFixed(1)} kW - over the ${c.limits.maxExportKw} kW limit` });
    if (slot && slot.buyCtKwh == null) warnings.push({ code: "no_price", level: 1, text: "No purchase price for now - check the tariff zones or the market data" });
    const usesMarket = c.purchase?.mode === "market" || c.sale?.mode === "market";
    const marketAge = st.price?.fetchedAt ? now - Date.parse(st.price.fetchedAt) : Infinity;
    if (usesMarket && marketAge > MARKET_STALE_MS)
      warnings.push({ code: "market_stale", level: 1, text: `Market prices not updated${st.price?.error ? ` - ${st.price.error}` : ""}` });
    await apiClient.syncMessages(process.id, "error", errors);
    await apiClient.syncMessages(process.id, "warning", warnings);
    await apiClient.setCritical(process.id, outage);
    await apiClient.setWarning(process.id, warnings.length > 0);

    // --- metrics and the time series -----------------------------------------
    const r = (x: number | null, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
    const loggable: Record<string, number> = {};
    if (power !== null) loggable["grid.powerKw"] = r(power, 3)!;
    if (slot?.buyCtKwh != null) loggable["grid.buyCtKwh"] = slot.buyCtKwh;
    if (slot?.sellCtKwh != null) loggable["grid.sellCtKwh"] = slot.sellCtKwh;
    if (!st.declared && Object.keys(loggable).length) {
      try {
        await apiClient.declareSeries(process.id, [
          { valueKey: "grid.powerKw", name: "Grid power (+ import / - export)", unit: "kW", kind: "gauge", mode: "period", periodS: 300 },
          { valueKey: "grid.buyCtKwh", name: "Purchase price", unit: "ct/kWh", kind: "gauge", mode: "change", maxIntervalS: 3600 },
          { valueKey: "grid.sellCtKwh", name: "Sale price", unit: "ct/kWh", kind: "gauge", mode: "change", maxIntervalS: 3600 },
        ]);
        st.declared = true;
      } catch (err) {
        logger.warn({ processId: process.id, err }, "energy-grid: failed to declare the series");
      }
    }
    await apiClient.setMetrics(process.id, {
      phasesV: phases.map((v) => r(v, 1)),
      frequencyHz: r(frequency, 3),
      powerKw: r(power, 3),
      flow: power === null || Math.abs(power) < 0.01 ? "none" : power > 0 ? "import" : "export",
      outage,
      importRegisterKwh: r(imported, 3),
      exportRegisterKwh: r(exported, 3),
      buyCtKwh: slot?.buyCtKwh ?? null,
      sellCtKwh: slot?.sellCtKwh ?? null,
      spotEurMwh: slot?.spotEurMwh ?? null,
      tariffZone: slot?.zone ?? null,
      priceSource: st.price?.source ?? null,
      today: { date: acc.date, importKwh: r(acc.importKwh, 3)!, exportKwh: r(acc.exportKwh, 3)!, costEur: r(acc.costEur)!, revenueEur: r(acc.revenueEur)! },
      values: loggable,
    });
  });
}
