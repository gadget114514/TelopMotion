
## $(date +%Y-%m-%d) - [Cache Canvas Pre-rendering]
**Learning:** `canvas.toDataURL()` performs synchronous PNG encoding, which can be computationally expensive on the main thread. Using a purely in-memory `canvas` element (`offscreenCanvas` or detached canvas) and `ctx.drawImage(sourceCanvas, 0, 0)` is a faster rendering path than generating and decoding base64 PNGs, especially when dealing with complex vector graphics scaling on user keystrokes.
**Action:** When caching canvas drawing output for performance, prefer drawing to an in-memory detached `<canvas>` and using `ctx.drawImage` to copy it, rather than serializing the canvas to a Data URL string unless persistence or an explicit `<img>` element is strictly required by the layout.
