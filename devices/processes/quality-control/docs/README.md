# Quality Control and Packing

QC and packing of the metal shop (the demo's factory, 2026-11-18, step 5), after the drying oven.

- **The batches:** the oven's dried ones (`ovenProcessId` - its `dried` list) queue at the station; each
  batch's coating comes from the line's finished bars (`lineProcessId` - its `recent`).
- **The inspection:** one batch at a time over `qc.inspectMin`, `qc.points` points measured one after another
  at the gauge (node type `coating-gauge`; a simulated gauge gets each point as its reading). Passed if the
  thinnest point reaches `qc.minUm`, else "to check"; a few parts rejected from the handling, more for a thin
  batch. The same batch always measures the same (seeded by its id).
- **The packing:** the passed parts onto pallets of `qc.perPallet`.
- **Metrics:** the batch in work (its points so far), the queue, the last results, the pallets, today (the
  batches, the parts passed / rejected, the rejects %, the pallets); **series** `qc.passed`, `qc.rejectsPct`;
  **WEM** - a batch to check, the day's rejects over `qc.rejectsWarnPct` (default 3 %).
