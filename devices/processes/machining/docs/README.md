# Machining (saw and CNC)

The blanks and the CNC machining of the metal shop (the demo's factory, 2026-11-19, step 7).

- **The shift** (`shift` - `fromH`, `toH`, `days`; default weekdays 6-22): off it the saw and the machines stop;
  at its start every material under its minimum gets its lot (`materials[]` - `key`, `name`, `stockM`, `minM`,
  `lotM`).
- **The saw** (`saw` - node type `band-saw`): one blank per `spec.cutS` for the machine with the fewest blanks in
  its buffer (up to `spec.bufferMax`), its job's material - the blank's length plus `spec.kerfMm` off the stock.
- **The machines** (`machines[]` - `cnc-machine`, `name`, `startJob`): each runs the jobs (`jobs[]` - `program`,
  `part`, `material`, `blankMm`, `qty`, `cycleS`, `setupMin`) in turn - the setup, one part per cycle while it
  has blanks (idle without them), the tool's life (`spec.toolLifeMin`) - spent, an alarm for its change
  (`spec.toolChangeMin`).
- **OEE** - the cycles' time over the shift's time x `spec.performance` x the quality (QC's rejects today -
  `qcProcessId`).
- **Metrics:** the saw, the stock, each machine (its state, job, progress, cycle left, tool, power, OEE), today
  (the parts, the cuts, kWh, OEE); **series** `mach.powerKw`, `mach.parts`, `mach.m<k>.powerKw`; **WEM** - a
  material under its minimum, a tool alarm. The state survives a restart (the last metrics).
