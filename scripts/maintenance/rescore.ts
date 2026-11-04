/**
 * scripts/maintenance/rescore.ts   —   npm run db:rescore
 *
 * Re-scores every candidate in every requisition with the current scoring code and
 * scorecard, replacing the stored score and discarding the cached model answer. Use
 * it after changing the scorer, the verification rules or the LLM provider. It applies
 * exactly the rules a fresh upload does (it calls the same function).
 *
 * With a real provider (anthropic/gemini) this makes one model call per candidate and
 * costs money; with the default heuristic provider it is free and instant.
 */
import { db } from '@/db'
import { pipelineEntries } from '@/db/schema'
import { scoreCandidate } from '@/lib/ingestion/process'

async function main() {
  const entries = await db
    .select({ candidateId: pipelineEntries.candidateId, requisitionId: pipelineEntries.requisitionId })
    .from(pipelineEntries)

  const tally = { scored: 0, lowConfidence: 0, noScorecard: 0, failed: 0 }
  for (const e of entries) {
    try {
      const out = await scoreCandidate(e.candidateId, e.requisitionId, { text: '', hash: '' }, { replace: true })
      if (out.kind === 'no_scorecard') tally.noScorecard++
      else {
        tally.scored++
        if (out.lowConfidence) tally.lowConfidence++
      }
    } catch (err) {
      tally.failed++
      console.error(`  ${e.candidateId}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`Re-scored ${entries.length} candidate/requisition pairs:`, tally)
  if (tally.failed) process.exitCode = 1
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((err) => { console.error(err); process.exit(1) })
