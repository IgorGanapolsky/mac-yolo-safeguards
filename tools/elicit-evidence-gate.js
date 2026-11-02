'use strict';

/**
 * Checks from Elicit.
 * Sources:
 * https://elicit.com/
 * https://elicit.com/solutions/systematic-review
 * https://elicit.com/solutions/routines
 * https://elicit.com/blog/elicit-reports-eval/
 * https://elicit.com/blog/evaluating-elicit-slr
 *
 * A protocol, a screening decision, an extraction row, a sentence citation,
 * and a routine schedule are shapes. This module does not sign in, search
 * papers, score a report, or edit a living note.
 */

const SOURCE = 'https://elicit.com/';
const SYSTEMATIC_REVIEW_DOC = 'https://elicit.com/solutions/systematic-review';
const ROUTINES_DOC = 'https://elicit.com/solutions/routines';
const REPORTS_EVAL_DOC = 'https://elicit.com/blog/elicit-reports-eval/';
const SLR_DOC = 'https://elicit.com/blog/evaluating-elicit-slr';
const STEPS = [
  'refine_protocol',
  'gather_sources',
  'screen_with_exclusion_reason',
  'extract_with_quote',
  'synthesize_with_sentence_citation',
];

function filled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function bareDomain(locator) {
  const text = String(locator || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text);
}

function assessProtocol(protocol) {
  const source = protocol && typeof protocol === 'object' ? protocol : {};
  const questionNamed = filled(source.question);
  const keywordNamed = filled(source.keyword_query);
  const semanticNamed = filled(source.semantic_query);
  return {
    question_named: questionNamed,
    keyword_query_named: keywordNamed,
    semantic_query_named: semanticNamed,
    shape_complete: questionNamed && (keywordNamed || semanticNamed),
    searches_ran: false,
  };
}

function decisionComplete(row) {
  if (!row || typeof row !== 'object') return false;
  const decision = typeof row.decision === 'string' ? row.decision.trim().toLowerCase() : '';
  if (decision !== 'include' && decision !== 'exclude') return false;
  if (!filled(row.locator) || !filled(row.quote)) return false;
  if (decision === 'exclude' && !filled(row.exclusion_reason)) return false;
  if (bareDomain(row.locator)) return false;
  return true;
}

function assessScreening(screening) {
  const source = screening && typeof screening === 'object' ? screening : {};
  const decisions = Array.isArray(source.decisions) ? source.decisions : [];
  const left = typeof source.reviewer_a === 'string' ? source.reviewer_a.trim() : '';
  const right = typeof source.reviewer_b === 'string' ? source.reviewer_b.trim() : '';
  return {
    decisions_named: decisions.length,
    decisions_shape_complete: decisions.length > 0 && decisions.every(decisionComplete),
    dual_review_named: left.length > 0 && right.length > 0 && left !== right,
    screening_ran: false,
    prisma_audit_written: false,
    recall_measured: false,
    recall_pct: null,
  };
}

function assessExtraction(extraction) {
  const source = extraction && typeof extraction === 'object' ? extraction : {};
  const rows = Array.isArray(source.rows) ? source.rows : [];
  const complete = rows.length > 0 && rows.every((row) => row && filled(row.field) && filled(row.quote) && !bareDomain(row.quote));
  return {
    rows_named: rows.length,
    shape_complete: complete,
    extraction_ran: false,
    quote_checked: false,
    accuracy_measured: false,
    accuracy_pct: null,
    false_negatives: null,
  };
}

function claimComplete(claim) {
  if (!claim || typeof claim !== 'object') return false;
  if (!filled(claim.text) || !filled(claim.quote) || !filled(claim.locator)) return false;
  if (bareDomain(claim.locator)) return false;
  return true;
}

function assessSynthesis(synthesis) {
  const source = synthesis && typeof synthesis === 'object' ? synthesis : {};
  const claims = Array.isArray(source.claims) ? source.claims : [];
  return {
    methods_named: filled(source.methods),
    claims_named: claims.length,
    claims_shape_complete: claims.length === 5 && claims.every(claimComplete),
    sentence_citation_checked: false,
    report_written: false,
    prisma_flow_exported: false,
  };
}

function assessRoutine(routine) {
  const source = routine && typeof routine === 'object' ? routine : {};
  return {
    instructions_named: filled(source.watch),
    schedule_named: filled(source.schedule),
    reviewed_before_start: false,
    routine_started: false,
    artifact_updated: false,
    updates_existing_artifact_instead_of_reading_list: false,
    summary_written: false,
    inbox_notified: false,
    files_written: false,
    shared_hub_opened: false,
    target_paths: null,
  };
}

function assessElicit({ protocol, screening, extraction, synthesis, routine } = {}) {
  const protocolCheck = assessProtocol(protocol);
  const screeningCheck = assessScreening(screening);
  const extractionCheck = assessExtraction(extraction);
  const synthesisCheck = assessSynthesis(synthesis);
  const routineCheck = assessRoutine(routine);
  return {
    source: SOURCE,
    systematic_review_doc: SYSTEMATIC_REVIEW_DOC,
    routines_doc: ROUTINES_DOC,
    eval_methodology_source: REPORTS_EVAL_DOC,
    slr_doc: SLR_DOC,
    passed: false,
    files_written: false,
    account_signed_in: false,
    api_called: false,
    vendor_figures_stored: false,
    five_step_prisma_pipeline: {
      steps: STEPS,
      protocol: protocolCheck,
      screening: screeningCheck,
      extraction: extractionCheck,
      synthesis: synthesisCheck,
    },
    sentence_level_citation_and_source_filter: {
      exact_sentence_required_for_shape: true,
      bare_domain_locator_rejected: true,
      citation_checked: false,
    },
    top_five_claims_rubric: {
      accuracy_labels: ['correct', 'minor_error', 'major_error'],
      citation_labels: ['fully_supported', 'partially_supported', 'unsupported'],
      measured_accuracy_score: null,
      measured_citation_support_score: null,
      claims_shape_complete: synthesisCheck.claims_shape_complete,
      caller_scores_accepted: false,
      claims_echoed: false,
    },
    living_routines_and_shared_library: routineCheck,
  };
}

module.exports = {
  assessElicit,
  assessProtocol,
  assessScreening,
  assessSynthesis,
  STEPS,
};
