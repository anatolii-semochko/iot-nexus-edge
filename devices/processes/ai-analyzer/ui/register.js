// CORE Library process-kind UI registration (AGENTS.md section 82) - loaded
// by apps/ui's pluginProcessTypes.js glob over devices/processes/*/ui/.
import { processTypeRegistry } from 'src/processTypeRegistry'
import AiAnalyzerPanel from './AiAnalyzerPanel'

processTypeRegistry.registerPanel('ai-analyzer', AiAnalyzerPanel)
