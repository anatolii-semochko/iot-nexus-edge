// The metal shop's panel - step 1, a mockup (iot AGENTS_TO_DO.md 2026-11-17/18: the panels first, made live
// later): plausible figures of a small metalworking factory, fixed, in the shape the live process will
// publish (its metrics). Keys of `zones` - the picture's zones (factory-shop.json `rooms`, in order).

export const MOCK = {
  summary: { powerKw: 96.4, todayEur: 214.3, batches: 3, oee: 74 },
  zones: [
    {
      key: 'blanks',
      state: 'run',
      lines: [
        ['Saw', 'cutting'],
        ['Stock 6061 Ø40', '38 m'],
        ['Cuts today', '124'],
      ],
    },
    {
      key: 'cnc',
      state: 'warn',
      lines: [
        ['CNC 1', 'running - 14 / 40'],
        ['CNC 2', 'setup - 25 min'],
        ['OEE today', '71 %'],
      ],
    },
    {
      key: 'line',
      state: 'run',
      lines: [
        ['Hoist', 'Anodize - bar 3 / 6'],
        ['Anodize', '19.8 °C - 1.4 A/dm²'],
        ['Rectifier', '14.2 V - 2860 A'],
      ],
    },
    {
      key: 'oven',
      state: 'run',
      lines: [
        ['Oven', '82 °C'],
        ['Batch B-0412', '12 min left'],
      ],
    },
    {
      key: 'qc',
      state: 'run',
      lines: [
        ['Passed today', '312'],
        ['Rejected', '2'],
        ['Pallet 2', 'packing'],
      ],
    },
    {
      key: 'utilities',
      state: 'run',
      lines: [
        ['Compressed air', '7.1 bar - 11 kW'],
        ['Chiller', '9.0 °C'],
        ['Wastewater', 'pH 7.4'],
        ['DI water', '2.1 µS/cm'],
      ],
    },
  ],
  batches: [
    { id: 'B-0410', part: 'Housing A-12', qty: 40, stage: 'QC and packing', pct: 92, eta: '14:20' },
    { id: 'B-0411', part: 'Bracket K-7', qty: 120, stage: 'Anodizing line', pct: 58, eta: '15:45' },
    { id: 'B-0412', part: 'Cover P-3', qty: 60, stage: 'Drying oven', pct: 76, eta: '14:55' },
    { id: 'B-0413', part: 'Housing A-12', qty: 40, stage: 'CNC machining', pct: 35, eta: '17:30' },
  ],
}
