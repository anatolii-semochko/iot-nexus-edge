import { useSelector } from 'react-redux'
import { canWith } from './access'

// Whether the person sees the simulation (2026-10-27 - the permission `simulation.view`; the
// administrators and operators by default, not the viewers or the guest): without it the units show as
// if real - no simulation tint on the rows, no "Simulation" status or header badge, no simulation
// switch for those who may not simulate. Only the marks - the simulation itself, the Simulator, the
// other rights stay as they are.

export const useHideSimulation = () =>
  useSelector((state) => !canWith(state.access, 'simulation.view'))

/** A row's tint for its simulated state - none when the person doesn't see the simulation. */
export const simulationTint = (simulated, hide) => (simulated && !hide ? 'info' : undefined)
