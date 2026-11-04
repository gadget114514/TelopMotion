## 2026-11-04 - Array allocation bottleneck in evaluateBeat quadForLetter
**Learning:** Returning intermediate arrays in hot functions like `quadForLetter` called repeatedly per letter per frame inside `evaluateBeat` creates noticeable GC pressure and slows down rendering performance.
**Action:** Always inline array structures and return final primitive coordinate arrays directly when possible in rendering hot paths.
