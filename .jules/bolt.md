
## 2024-05-13 - Cached motionDef evaluations
**Learning:** `mergeDeep` was called excessively in `motionDef` inside `rigidAt`, which sits inside the main N-letter loop of `evaluateBeat`. Because beat-level instances remain identical and duration does not change, re-evaluating `motionDef` over and over per letter per frame was causing a significant ~35% performance hit on CPU execution time during playback for heavily populated scenes.
**Action:** Use a `WeakMap` cached by `instance` in `motionDef` so that its computation runs once per unique effect per duration instead of N times per beat.
