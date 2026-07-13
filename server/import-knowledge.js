// Import a machine-readable conversation index into the local knowledge base.
// The import is repeatable because records are deduplicated by md_path.
//
// Usage:
//   PROJECT_OS_KB_DIR="/absolute/path/to/knowledge-export" node import-knowledge.js

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_WORKSPACE_ID, upsertKnowledgeByRef } from './store.js';

const KB_DIR = String(process.env.PROJECT_OS_KB_DIR || '').trim();

if (!KB_DIR) {
  console.error('Set PROJECT_OS_KB_DIR to the knowledge-export directory.');
  process.exit(1);
}

const CSV = process.env.PROJECT_OS_KB_INDEX
  ? path.resolve(process.env.PROJECT_OS_KB_INDEX)
  : path.join(KB_DIR, 'conversation_index.csv');

/** Minimal RFC 4180 parser with quoted commas, newlines, and escaped double quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      /* skip */
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function cleanTitle(raw, businessLine) {
  const t = String(raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length < 4 || /cwd|environment_context|shell/i.test(t)) {
    return `${businessLine} conversation`;
  }
  return t.slice(0, 50);
}

function main() {
  if (!fs.existsSync(CSV)) {
    console.error(`Conversation index not found: ${CSV}`);
    console.error('Check PROJECT_OS_KB_DIR or set PROJECT_OS_KB_INDEX to the CSV file.');
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  const iBL = col('business_line');
  const iId = col('id');
  const iTitle = col('title');
  const iCreated = col('created');
  const iMsg = col('message_count');
  const iMd = col('md_path');

  const items = [];
  for (const r of rows.slice(1)) {
    if (!r || r.length < header.length) continue;
    const businessLine = r[iBL] || 'Uncategorized/General';
    const ref = r[iMd] || `${businessLine}:${r[iId]}`;
    items.push({
      type: 'Conversation',
      title: cleanTitle(r[iTitle], businessLine),
      body: `Conversation ${r[iId] || ''}; ${r[iMsg] || '?'} messages. Source: ${r[iMd] || ''}`,
      tags: ['conversation', ...String(businessLine).split('/').filter(Boolean)],
      businessLine,
      source: 'imported-conversations',
      workspaceId: DEFAULT_WORKSPACE_ID,
      ref,
    });
  }
  const added = upsertKnowledgeByRef(items);
  console.log(`Import complete: ${added} conversations added from ${items.length} scanned records.`);
}

main();
