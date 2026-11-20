/**
 * "metal-shop" process kind - API side (CORE Library package; the demo's factory, iot AGENTS_TO_DO.md 2026-11-20 -
 * the factory's stage 5, the AI): the AI Assistant's tools over the whole shop - its processes' metrics (the
 * summary's own config names them: machining, the anodizing line, the oven, QC, the utilities; the chemistry by
 * its kind) and their open warnings:
 *  - `metalShop.shift` - the shop now and the shift ahead (setups, tool changes, the stock, the chemicals, the
 *    collection tank) - a shift's plan or report;
 *  - `metalShop.batch` - one bar's (batch's) whole way: the line's steps and coating, the oven, QC's readings;
 *  - `metalShop.anomalies` - what is off now, with its figures (the baths out of band, a machine in alarm, a tool
 *    near its end, a tank low, the wastewater, QC's rejects, the line's price mode...).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Library package is loaded at run time by the api and imports nothing from it
type Any = any;

const SHOP_KINDS = ["metal-shop", "machining", "anodizing-line", "drying-oven", "quality-control", "shop-utilities", "chem-wastewater"];

export default async function metalShopApi(_app: Any, ctx: Any): Promise<void> {
  const { pool, registerAiTool, processMetrics } = ctx;
  if (!registerAiTool) return;

  /** The shop's summary process (`processId` or the only one) and its processes' metrics by kind. */
  const load = async (input: Record<string, unknown>) => {
    const { rows } = await pool.query("SELECT id, name, kind, config FROM processes WHERE kind = ANY($1) ORDER BY id", [SHOP_KINDS]);
    const shops = rows.filter((r: Any) => r.kind === "metal-shop");
    const shop = typeof input.processId === "number" ? shops.find((r: Any) => r.id === input.processId) : shops.length === 1 ? shops[0] : null;
    if (!shop) throw new Error(`processId is required - a metal-shop process: ${shops.map((r: Any) => `${r.id} ${r.name}`).join(", ") || "none"}`);
    const c = shop.config ?? {};
    const pick = (id: unknown, kind: string) => rows.find((r: Any) => (typeof id === "number" ? r.id === id : r.kind === kind));
    const procs: Record<string, Any> = {
      shop,
      machining: pick(c.machiningProcessId, "machining"),
      line: pick(c.lineProcessId, "anodizing-line"),
      oven: pick(c.ovenProcessId, "drying-oven"),
      qc: pick(c.qcProcessId, "quality-control"),
      utilities: pick(c.utilitiesProcessId, "shop-utilities"),
      chem: pick(undefined, "chem-wastewater"),
    };
    const m: Record<string, Any> = {};
    for (const [k, p] of Object.entries(procs)) m[k] = p ? ((await processMetrics?.(p.id)) ?? {}) : {};
    const ids = Object.values(procs).filter(Boolean).map((p: Any) => p.id);
    const warnings = (
      await pool.query(
        `SELECT process_id, type, level, text, created_at FROM log_messages
          WHERE process_id = ANY($1) AND resolved_at IS NULL AND NOT hidden ORDER BY level DESC, created_at DESC LIMIT 40`,
        [ids],
      )
    ).rows.map((w: Any) => ({ process: Object.values(procs).find((p: Any) => p?.id === w.process_id)?.name, type: w.type, level: w.level, text: w.text, since: w.created_at }));
    return { procs, m, warnings };
  };

  const r1 = (x: unknown) => (Number.isFinite(Number(x)) ? Math.round(Number(x) * 10) / 10 : null);
  const at = (ms: unknown) => (Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString() : null);

  registerAiTool({
    processKind: "metal-shop",
    name: "metalShop.shift",
    description:
      "The metal shop now and the shift ahead (the demo's factory: blanks and saw, CNC machining, the anodizing line, the drying oven, QC and packing, chemistry and wastewater, utilities). Now: the shop's power, today's kWh / € and the 15-minute peak, the batches in work (where, how far, ready at); each zone's state - the line's baths (temperature vs set point, the bar in each, its step's time left), the hoist, the rectifier, the baths' heat by the electricity's price (cheap - storing heat, dear - saving); the CNC machines (state, job, parts done of the quantity, tool life, OEE), the saw and the bar stock; the oven; QC (passed / rejected, pallets, the last readings); the chemicals' tanks (level, the days they last), the dosing, the wastewater; the utilities. Ahead: each machine's job end and next setup, tool changes due, the stock under its minimum, the tanks to order, the collection tank's time to full. With the open warnings. Use it for a shift's plan or report, or to answer how the shop is doing.",
    input: { type: "object", properties: { processId: { type: "integer", description: "the metal-shop process; default - the only one" } }, additionalProperties: false },
    async run(input: Record<string, unknown>) {
      const { m, warnings } = await load(input);
      const now = Date.now();
      const machines = (m.machining.machines ?? []).map((x: Any) => {
        const left = Math.max(0, (Number(x.qty) || 0) - (Number(x.done) || 0));
        const jobEndMin = x.state === "run" && x.cycleS ? Math.round((left * x.cycleS) / 60) : null;
        return {
          name: x.name,
          state: x.state,
          program: x.program,
          part: x.part,
          done: x.done,
          qty: x.qty,
          blanks: x.blanks,
          oeePct: x.oeePct,
          toolLeftMin: x.toolLeftMin,
          setupLeftMin: x.setupLeftMin,
          jobEndsInMin: jobEndMin,
        };
      });
      return {
        at: new Date(now).toISOString(),
        shop: { powerKw: m.shop.powerKw, today: m.shop.today, priceCtKwh: m.shop.priceCtKwh, inWork: m.shop.flow },
        line: {
          hoist: m.line.hoist && { state: m.line.hoist.state, bar: m.line.hoist.bar },
          rectifier: m.line.rectifier,
          price: m.line.price,
          baths: (m.line.baths ?? []).map((b: Any) => ({ name: b.name, tempC: b.tempC, setC: b.setC, levelPct: b.levelPct, heating: b.heating, cooling: b.cooling })),
          bars: (m.line.bars ?? []).map((b: Any) => ({ id: b.id, bath: b.bath, step: b.step, of: b.steps, leftS: b.leftS, coatingUm: b.coatingUm, carried: b.carried })),
          today: m.line.today,
        },
        machining: { onShift: m.machining.onShift, machines, saw: m.machining.saw, stock: m.machining.stock, today: m.machining.today },
        oven: { tempC: m.oven.tempC, setC: m.oven.setC, drying: m.oven.drying, queue: m.oven.queue, today: m.oven.today },
        qc: { current: m.qc.current, queue: m.qc.queue, today: m.qc.today, pallets: m.qc.pallets, lastResults: (m.qc.results ?? []).slice(-5) },
        chemistry: {
          tanks: m.chem.tanks,
          dosing: m.chem.dosing,
          wastewater: m.chem.wastewater && { ...m.chem.wastewater, state: undefined },
          today: m.chem.today,
        },
        utilities: { compressor: m.utilities.compressor, chiller: m.utilities.chiller, di: m.utilities.di },
        ahead: {
          machines: machines.map((x: Any) => ({ name: x.name, state: x.state, jobEndsInMin: x.jobEndsInMin, then: "a setup for the next job", toolLeftMin: x.toolLeftMin })),
          stockUnderMin: (m.machining.stock ?? []).filter((s: Any) => s.stockM < s.minM),
          tanksToOrder: (m.chem.tanks ?? []).filter((t: Any) => t.state !== "ok").map((t: Any) => ({ name: t.name, levelPct: t.levelPct, daysLeft: t.daysLeft, orderedOn: t.orderedOn })),
          collectionTankFullInMin: m.chem.wastewater?.minutesToFull ?? null,
        },
        warnings,
      };
    },
  });

  registerAiTool({
    processKind: "metal-shop",
    name: "metalShop.batch",
    description:
      "One batch's (a bar of parts, e.g. \"L-0028\") whole way through the metal shop: its part and quantity, where it is now and how far (the shop's route), ready at; on the anodizing line - the step and the bath, the time there, the coating and the ampere-hours (or its finish, coating and Ah if it left the line); the drying oven (drying, queued or dried at); QC - the readings (mean, min, max, the points), the verdict and the rejected parts. Use it for a batch's report or to answer about one batch.",
    input: {
      type: "object",
      properties: { id: { type: "string", description: "the batch's (the bar's) id, e.g. L-0028" }, processId: { type: "integer", description: "the metal-shop process; default - the only one" } },
      required: ["id"],
      additionalProperties: false,
    },
    async run(input: Record<string, unknown>) {
      const id = String(input.id ?? "").trim();
      const { m } = await load(input);
      const part = (m.shop.parts ?? []).find((p: Any) => p[0] === id)?.[1] ?? null;
      const flow = (m.shop.flow ?? []).find((b: Any) => b.id === id) ?? null;
      const onLine = (m.line.bars ?? []).find((b: Any) => b.id === id) ?? null;
      const leftLine = (m.line.recent ?? []).find((b: Any) => b.id === id) ?? null;
      const oven = {
        drying: (m.oven.drying ?? []).find((b: Any) => b.id === id) ?? null,
        queued: (m.oven.queue ?? []).some((b: Any) => (typeof b === "string" ? b : b?.id) === id),
        driedAt: at((m.oven.dried ?? []).find((b: Any) => b.id === id)?.at),
      };
      const qc = (m.qc.results ?? []).find((r: Any) => r.id === id) ?? null;
      if (!part && !flow && !onLine && !leftLine && !oven.drying && !oven.queued && !oven.driedAt && !qc)
        return { note: `no batch ${id} in the shop's recent records (the line keeps its last finished bars, QC its last results)` };
      return {
        id,
        part,
        now: flow && { stage: flow.stage, where: flow.where, pct: flow.pct, qty: flow.qty, readyAt: at(flow.readyAt) },
        line: onLine
          ? { step: onLine.step, of: onLine.steps, bath: onLine.bath, minutesThere: onLine.elapsedMin, needMin: onLine.needMin, coatingUm: onLine.coatingUm, carried: onLine.carried }
          : leftLine && { finishedAt: at(leftLine.at), coatingUm: leftLine.coatingUm, ah: leftLine.ah },
        oven,
        qc: qc && { at: at(qc.at), meanUm: qc.meanUm, minUm: qc.minUm, maxUm: qc.maxUm, points: qc.points, verdict: qc.verdict, parts: qc.parts, rejected: qc.rejected },
      };
    },
  });

  registerAiTool({
    processKind: "metal-shop",
    name: "metalShop.anomalies",
    description:
      "What is off in the metal shop now, each with its figures and how serious (critical / warning / note): the line's baths out of their band or low, the rectifier off with a bar in the anodize bath, a CNC machine in alarm or its tool near its end, the OEE low, the bar stock under its minimum, the oven off its set point, QC's rejects high or a coating out of spec, a chemical tank low, the wastewater's pH out of its limits, the collection tank high, the press's cloth worn, the compressed air low, the DI water over its limit; with the processes' open warnings. Use it to find the causes when something looks wrong, or for a check of the whole shop.",
    input: { type: "object", properties: { processId: { type: "integer", description: "the metal-shop process; default - the only one" } }, additionalProperties: false },
    async run(input: Record<string, unknown>) {
      const { m, warnings } = await load(input);
      const out: { severity: "critical" | "warning" | "note"; zone: string; what: string; figures: Record<string, unknown> }[] = [];
      const add = (severity: "critical" | "warning" | "note", zone: string, what: string, figures: Record<string, unknown>) => out.push({ severity, zone, what, figures });
      for (const b of m.line.baths ?? []) {
        if (b.setC !== null && b.setC !== undefined && Math.abs(b.tempC - b.setC) > 1.5) add("warning", "line", `${b.name} off its set point`, { tempC: b.tempC, setC: b.setC });
        if (b.levelPct < 80) add("warning", "line", `${b.name} low`, { levelPct: b.levelPct });
      }
      const inAnodize = (m.line.bars ?? []).find((b: Any) => b.bath && /anodi/i.test(b.bath) && !b.carried);
      if (inAnodize && !m.line.rectifier?.on) add("critical", "line", "a bar in the anodize bath with the rectifier off", { bar: inAnodize.id });
      for (const x of m.machining.machines ?? []) {
        if (x.state === "alarm") add("critical", "machining", `${x.name} in alarm (a tool change)`, { program: x.program });
        else if (x.state === "run" && Number(x.toolLeftMin) < 20) add("note", "machining", `${x.name}'s tool near its end`, { toolLeftMin: x.toolLeftMin });
        if (Number(x.oeePct) < 60) add("warning", "machining", `${x.name}'s OEE low`, { oeePct: x.oeePct });
      }
      for (const s of m.machining.stock ?? []) if (s.stockM < s.minM) add("warning", "blanks", `${s.name} under its minimum`, { stockM: s.stockM, minM: s.minM });
      if (Number.isFinite(m.oven.tempC) && Number.isFinite(m.oven.setC) && (m.oven.drying ?? []).length && Math.abs(m.oven.tempC - m.oven.setC) > 3)
        add("warning", "oven", "the oven off its set point while drying", { tempC: m.oven.tempC, setC: m.oven.setC });
      const qcToday = m.qc.today ?? {};
      const qcParts = (Number(qcToday.passed) || 0) + (Number(qcToday.rejected) || 0);
      if (qcParts >= 40 && Number(qcToday.rejected) / qcParts > 0.03) add("warning", "qc", "QC's rejects over 3 %", { passed: qcToday.passed, rejected: qcToday.rejected });
      for (const r of (m.qc.results ?? []).slice(-5)) if (r.verdict && r.verdict !== "passed") add("warning", "qc", `${r.id}: ${r.verdict}`, { meanUm: r.meanUm, minUm: r.minUm, maxUm: r.maxUm });
      for (const t of m.chem.tanks ?? [])
        if (t.state !== "ok") add(t.state === "critical" ? "critical" : "warning", "chemistry", `${t.name} ${t.state === "critical" ? "almost empty" : "to order"}`, { levelPct: t.levelPct, daysLeft: t.daysLeft, orderedOn: t.orderedOn });
      const w = m.chem.wastewater;
      if (w) {
        if (w.ph < w.discharge?.minPh || w.ph > w.discharge?.maxPh) add("critical", "wastewater", "the discharge's pH out of its limits", { ph: w.ph, limits: w.discharge });
        if (w.collectionPct > w.highPct) add("warning", "wastewater", "the collection tank high", { pct: w.collectionPct, fullInMin: w.minutesToFull });
        if (w.dpBar > w.dpLimitBar) add("warning", "wastewater", "the filter press's cloth worn", { dpBar: w.dpBar, limitBar: w.dpLimitBar });
      }
      const u = m.utilities;
      if (u.compressor && u.compressor.bar < 6) add("warning", "utilities", "the compressed air low", { bar: u.compressor.bar });
      if (u.di && u.di.uScm > u.di.limit) add("warning", "utilities", "the DI water over its limit", { uScm: u.di.uScm, limit: u.di.limit });
      if (m.line.price?.mode === "dear") add("note", "energy", "the electricity dear now - the baths ride their band's bottom", { rank: m.line.price.rank });
      return { at: new Date().toISOString(), found: out.length, anomalies: out, warnings, peakKwToday: r1(m.shop.today?.peakKw) };
    },
  });
}
