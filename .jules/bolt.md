
## 2024-05-18 - Vanilla JS Search Input Sync Rendering
**Learning:** In vanilla JavaScript dialogs with live search functionality, updating the innerHTML or appending numerous DOM nodes directly on the 'input' event blocks the main thread synchronously on every keystroke. This can lead to significant UI freezing and poor typing performance if the list is long, even if the filter logic itself is relatively fast.
**Action:** Always wrap the input event handler for DOM-heavy filtering in a debounce function (e.g. 150ms delay) to prevent redundant DOM recreations during rapid typing.
