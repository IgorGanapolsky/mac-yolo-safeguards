# feat(qwen-yolo): full YOLO via official Qwen Code CLI

<!-- source: Merged PR | id: 2162 | closed: 2026-10-29T14:02:17.964Z -->

## Question

feat(qwen-yolo): full YOLO via official Qwen Code CLI

## Answer

## Test plan
- [x] `qwen-yolo --doctor` → READY
- [x] `node tests/test-qwen-yolo-wrapper.js`
- [x] `qwen-yolo -z 'Reply with exactly one word: alive'` → `alive`
- [x] `qwen-yolo --infer --local -p '…alive'` → MLX `alive`

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2162)

---
