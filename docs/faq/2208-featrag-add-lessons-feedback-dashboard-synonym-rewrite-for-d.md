# feat(rag): add lessons-feedback-dashboard synonym rewrite for dual-path R@10=1.00 A+

<!-- source: Merged PR | id: 2208 | closed: 2026-10-29T14:02:17.963Z -->

## Question

feat(rag): add lessons-feedback-dashboard synonym rewrite for dual-path R@10=1.00 A+

## Answer

## Verification
- `node --test tests/test-retrieval-query-rewrite.js` -> 5/5 PASS
- `node tools/rag-retrieval-eval.js --retriever dual-path` -> 9/9 PASS
- `node tools/system-a-plus-scorecard.js` -> Grade: A+ (score=1)

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2208)

---
