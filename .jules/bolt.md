
## 2026-11-09 - [Reduce per-frame allocations in evaluateBeat]
**Learning:** `scene.letters` is static after `buildScene` caches it. Creating `Map` objects and using string concatenations inside `evaluateBeat` (which runs per-frame per beat) generates large GC pressure and performance bottlenecks.
**Action:** Cache intermediate rank structures natively on the `scene` object (e.g. `scene._unitRanks`) to compute them only once per scene.
