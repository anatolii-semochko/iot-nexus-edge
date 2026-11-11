// Navigation for the packages (2026-11-11): a package's UI goes to another page through the app's router
// - a new history entry of its own, as a link does - never by writing location.hash (that is a history
// entry the router never made: no key of its own, and to the router it looks like Back / Forward).
// A package imports it from 'src/navigation' (it has no router import of its own).
import { useNavigate } from 'react-router-dom'

/** `go(path)` - a new page, e.g. go('/dashboard/16'); `go(path, { replace: true })` - the same entry. */
export const useAppNavigate = () => useNavigate()
