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
for (let i = 0; i < 1000; i++) {
  entries.push({
    label: 'Entry Label ' + i + ' with some query text',
    otherName: 'Other Name ' + i + ' query is here',
    meaning: 'This is the meaning of entry ' + i + ' query'
  });
}
const query = 'query';

console.time('Old');
for (let j = 0; j < 100; j++) {
  for (const entry of entries) {
    highlightMatchOld(entry.label, query);
    highlightMatchOld(entry.otherName, query);
    highlightMatchOld(entry.meaning, query);
  }
}
console.timeEnd('Old');

console.time('New');
for (let j = 0; j < 100; j++) {
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  for (const entry of entries) {
    highlightMatchNew(entry.label, regex);
    highlightMatchNew(entry.otherName, regex);
    highlightMatchNew(entry.meaning, regex);
  }
}
console.timeEnd('New');
