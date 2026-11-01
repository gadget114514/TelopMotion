## 2024-11-01 - highlightMatch regex instantiation in loop
**Learning:** Recompiling Regular Expressions in inner loops is surprisingly common but leads to unnecessary garbage collection overhead and execution time spikes, particularly during UI list filtering.
**Action:** Move regex creation outside the filtering loops when optimizing text highlight/search match functions, to improve filtering performance.

## 2026-11-01 - activeClips avoiding intermediate array allocations
**Learning:** In hot rendering loops (like 60fps), iterating over data via chained map/filter combinations allocates numerous intermediate arrays which pile up and trigger garbage collection stutters.
**Action:** Replace chains of `.filter(...).map(...)` with a single-pass  loop that pushes into an array/Set, specifically in functions executed per-frame.

## 2024-11-01 - activeClips avoiding intermediate array allocations
**Learning:** In hot rendering loops (like 60fps), iterating over data via chained map/filter combinations allocates numerous intermediate arrays which pile up and trigger garbage collection stutters.
**Action:** Replace chains of `.filter(...).map(...)` with a single-pass for loop that pushes into an array/Set, specifically in functions executed per-frame.
