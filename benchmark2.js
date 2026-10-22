const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function highlightMatchOld(text, query) {
  if (!text || !query) return escapeHtml(text || '');
  const escapedText = escapeHtml(text);
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapedText.replace(regex, '<mark>$1</mark>');
}

function highlightMatchNew(text, regex) {
  if (!text || !regex) return escapeHtml(text || '');
  const escapedText = escapeHtml(text);
  return escapedText.replace(regex, '<mark>$1</mark>');
}

const entries = [];
for (let i = 0; i < 5000; i++) {
  entries.push({
    label: 'Test Entry Label ' + i + ' query match',
    otherName: 'Other Name ' + i,
    meaning: 'Meaning of the effect ' + i + ' query'
  });
}
const query = 'query';

console.time('Old Implementation (Regex per match)');
for (let j = 0; j < 100; j++) {
  for (const entry of entries) {
    highlightMatchOld(entry.label, query);
    highlightMatchOld(entry.otherName, query);
    highlightMatchOld(entry.meaning, query);
  }
}
console.timeEnd('Old Implementation (Regex per match)');

console.time('New Implementation (Regex per search pass)');
for (let j = 0; j < 100; j++) {
  let queryRegex = null;
  if (query) {
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    queryRegex = new RegExp(`(${escapedQuery})`, 'gi');
  }
  for (const entry of entries) {
    highlightMatchNew(entry.label, queryRegex);
    highlightMatchNew(entry.otherName, queryRegex);
    highlightMatchNew(entry.meaning, queryRegex);
  }
}
console.timeEnd('New Implementation (Regex per search pass)');
