## 2024-05-19 - Optimize unitsFor array allocations
**Learning:** `unitsFor` function is re-evaluated multiple times per letter per frame. The previous implementation rebuilt the `units` object and did Map lookups inside the hot loop.
**Action:** Pre-calculate `unitsFor` and use a lookup array `unitsCache[index]`.
