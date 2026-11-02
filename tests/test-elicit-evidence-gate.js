'use strict';

const assert = require('assert');
const { assessElicit, STEPS } = require('../tools/elicit-evidence-gate');

const empty = assessElicit();
assert.strictEqual(empty.passed, false);
assert.strictEqual(empty.files_written, false);
assert.strictEqual(empty.account_signed_in, false);
assert.strictEqual(empty.api_called, false);
assert.strictEqual(empty.vendor_figures_stored, false);
assert.deepStrictEqual(empty.five_step_prisma_pipeline.steps, STEPS);
assert.strictEqual(empty.five_step_prisma_pipeline.steps.length, 5);
assert.strictEqual(empty.five_step_prisma_pipeline.protocol.shape_complete, false);
assert.strictEqual(empty.five_step_prisma_pipeline.protocol.searches_ran, false);
assert.strictEqual(empty.five_step_prisma_pipeline.screening.dual_review_named, false);
assert.strictEqual(empty.five_step_prisma_pipeline.screening.screening_ran, false);
assert.strictEqual(empty.five_step_prisma_pipeline.screening.recall_pct, null);
assert.strictEqual(empty.five_step_prisma_pipeline.extraction.extraction_ran, false);
assert.strictEqual(empty.five_step_prisma_pipeline.extraction.accuracy_pct, null);
assert.strictEqual(empty.five_step_prisma_pipeline.extraction.false_negatives, null);
assert.strictEqual(empty.five_step_prisma_pipeline.synthesis.claims_shape_complete, false);
assert.strictEqual(empty.five_step_prisma_pipeline.synthesis.report_written, false);
assert.strictEqual(empty.five_step_prisma_pipeline.synthesis.prisma_flow_exported, false);
assert.strictEqual(empty.top_five_claims_rubric.measured_accuracy_score, null);
assert.strictEqual(empty.top_five_claims_rubric.measured_citation_support_score, null);
assert.strictEqual(empty.top_five_claims_rubric.caller_scores_accepted, false);
assert.strictEqual(empty.living_routines_and_shared_library.updates_existing_artifact_instead_of_reading_list, false);
assert.strictEqual(empty.living_routines_and_shared_library.routine_started, false);
assert.strictEqual(empty.living_routines_and_shared_library.artifact_updated, false);
assert.strictEqual(empty.living_routines_and_shared_library.files_written, false);
assert.strictEqual(empty.living_routines_and_shared_library.target_paths, null);
assert.strictEqual(empty.sentence_level_citation_and_source_filter.citation_checked, false);

const secret = 'elicit-secret-do-not-echo-4c2b';
const named = assessElicit({
  protocol: {
    question: secret,
    keyword_query: 'systematic review AND ' + secret,
    semantic_query: secret,
  },
  screening: {
    reviewer_a: secret,
    reviewer_b: 'second-reviewer',
    decisions: [
      { decision: 'exclude', locator: 'doi:10.1/example', quote: secret, exclusion_reason: 'wrong population' },
    ],
  },
  extraction: {
    rows: [{ field: 'outcome', quote: secret, accuracy_score: 1 }],
  },
  synthesis: {
    methods: secret,
    claims: [1, 2, 3, 4, 5].map(() => ({
      text: secret,
      quote: secret,
      locator: 'doi:10.1/example',
      accuracy_score: 1,
      citation_support_score: 1,
    })),
  },
  routine: { watch: secret, schedule: 'weekly' },
});
assert.strictEqual(named.passed, false);
assert.strictEqual(named.files_written, false);
assert.strictEqual(named.five_step_prisma_pipeline.protocol.shape_complete, true);
assert.strictEqual(named.five_step_prisma_pipeline.protocol.searches_ran, false);
assert.strictEqual(named.five_step_prisma_pipeline.screening.decisions_shape_complete, true);
assert.strictEqual(named.five_step_prisma_pipeline.screening.dual_review_named, true);
assert.strictEqual(named.five_step_prisma_pipeline.screening.screening_ran, false);
assert.strictEqual(named.five_step_prisma_pipeline.extraction.shape_complete, true);
assert.strictEqual(named.five_step_prisma_pipeline.extraction.extraction_ran, false);
assert.strictEqual(named.five_step_prisma_pipeline.synthesis.claims_shape_complete, true);
assert.strictEqual(named.five_step_prisma_pipeline.synthesis.sentence_citation_checked, false);
assert.strictEqual(named.five_step_prisma_pipeline.synthesis.report_written, false);
assert.strictEqual(named.top_five_claims_rubric.measured_accuracy_score, null);
assert.strictEqual(named.top_five_claims_rubric.measured_citation_support_score, null);
assert.strictEqual(named.top_five_claims_rubric.caller_scores_accepted, false);
assert.strictEqual(named.living_routines_and_shared_library.instructions_named, true);
assert.strictEqual(named.living_routines_and_shared_library.schedule_named, true);
assert.strictEqual(named.living_routines_and_shared_library.reviewed_before_start, false);
assert.strictEqual(named.living_routines_and_shared_library.routine_started, false);
assert.strictEqual(named.living_routines_and_shared_library.artifact_updated, false);
const body = JSON.stringify(named);
assert.ok(!body.includes(secret));
for (const banned of ['99.5', '99.4', '84%', '64%', '73%', '80%', '10x', '138', '40000', '7 million', '5 million', '5.0']) {
  assert.ok(!body.includes(banned), banned);
}

const sameReviewer = assessElicit({
  screening: { reviewer_a: 'ada', reviewer_b: 'ada', decisions: [] },
});
assert.strictEqual(sameReviewer.five_step_prisma_pipeline.screening.dual_review_named, false);

const bare = assessElicit({
  synthesis: {
    claims: [1, 2, 3, 4, 5].map(() => ({
      text: 'a claim',
      quote: 'a sentence',
      locator: 'pmc.ncbi.nlm.nih.gov',
    })),
  },
  screening: {
    decisions: [{ decision: 'exclude', locator: 'doi:10.1/x', quote: 'a sentence' }],
  },
});
assert.strictEqual(bare.five_step_prisma_pipeline.synthesis.claims_shape_complete, false);
assert.strictEqual(bare.five_step_prisma_pipeline.screening.decisions_shape_complete, false);
assert.strictEqual(bare.sentence_level_citation_and_source_filter.bare_domain_locator_rejected, true);
assert.strictEqual(bare.sentence_level_citation_and_source_filter.citation_checked, false);

console.log('test-elicit-evidence-gate: PASS');
