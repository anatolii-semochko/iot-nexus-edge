// The Energy Field's decision (model.ts - English, for people and the AI) in the UI's language: the fixed
// texts by their key, those with a figure ("Plan: charging 4.2 kW") by their pattern (2026-11-07 - the
// panel showed it in English whatever the language).
const DYNAMIC = /^(Plan: discharging|Plan: charging|Manual: discharge|Manual: charge) (-?[\d.]+) kW$/

export const decisionText = (tr, decision) => {
  if (!decision) return decision
  const m = DYNAMIC.exec(decision)
  return m ? tr(`${m[1]} {{kw}} kW`, { kw: m[2] }) : tr(decision)
}
