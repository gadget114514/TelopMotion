## 2024-05-19 - Avoid Array.prototype.filter(...).length in hot paths
**Learning:** Using `Array.prototype.filter().length` in highly performance-sensitive rendering loops (like `evaluateBeatState` in `renderer/js/lyrics/engine.js`) creates unnecessary intermediate array allocations, adding memory pressure and GC pauses.
**Action:** Use a simple `for` loop with a counter instead of `.filter(...).length` in per-frame evaluation code.
