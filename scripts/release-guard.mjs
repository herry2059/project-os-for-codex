import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
});
const files = listed.split('\0').filter(Boolean);
const failures = [];
const legacyLanguageMarker = String.fromCharCode(122, 104, 45, 67, 78);
const legacyBrandMarker = [
  [104, 97, 111, 121, 117, 101],
  [104, 117, 97, 110, 103, 106, 117, 110, 104, 97, 111],
]
  .map((codes) => String.fromCharCode(...codes))
  .join('|');
const excludedToolMarker = String.fromCharCode(99, 108, 97, 117, 100, 101);
const excludedProviderMarker = String.fromCharCode(97, 110, 116, 104, 114, 111, 112, 105, 99);
const excludedPublicMarker = new RegExp(`${excludedToolMarker}|${excludedProviderMarker}`, 'i');

const forbiddenFile = (file) => {
  const base = path.basename(file).toLowerCase();
  if (excludedPublicMarker.test(file)) return true;
  if (base === '.env.example') return false;
  if (base === '.env' || base.startsWith('.env.')) return true;
  return /\.(pem|key|p12|pfx|crt|cer)$/i.test(base) || file.split('/').includes('.qa-profile');
};

const textRules = [
  ['non-English Han character', /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u],
  ['legacy locale or document path', new RegExp(legacyLanguageMarker, 'i')],
  ['legacy public brand marker', new RegExp(legacyBrandMarker, 'i')],
  ['region-specific font marker', /CJK|PingFang|Hiragino Sans GB|Microsoft YaHei|WenQuanYi/i],
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['personal absolute path', /\/(?:Users|Volumes)\//],
  ['credential embedded in URL', /https?:\/\/[^\s/:]+:[^\s/@]+@/],
  ['likely mainland mobile number', /(^|\D)1[3-9]\d{9}(\D|$)/],
  ['likely live provider token', /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{20,}\b/],
  ['OpenAI organization identifier', /\borg-[A-Za-z0-9]{12,}\b/],
  ['excluded external tool or provider marker', excludedPublicMarker],
];

const allowedEmailDomains = new Set(['example.com', 'example.test', 'users.noreply.github.com']);
const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

for (const file of files) {
  if (forbiddenFile(file)) {
    failures.push(`${file}: forbidden sensitive filename`);
    continue;
  }
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
  const buffer = fs.readFileSync(full);
  if (file.toLowerCase().endsWith('.png')) {
    const pngSignature = '89504e470d0a1a0a';
    if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
      failures.push(`${file}: .png extension does not contain PNG data`);
    }
  }
  if (buffer.includes(0)) continue;
  const text = buffer.toString('utf8');
  for (const [label, pattern] of textRules) {
    if (file === 'scripts/release-guard.mjs' && label !== 'non-English Han character') continue;
    if (file === 'pnpm-lock.yaml' && ['legacy public brand marker', 'region-specific font marker'].includes(label)) continue;
    if (pattern.test(text)) failures.push(`${file}: ${label}`);
  }
  if (file !== 'scripts/release-guard.mjs') {
    for (const match of text.matchAll(emailPattern)) {
      if (!allowedEmailDomains.has(String(match[1]).toLowerCase())) {
        failures.push(`${file}: non-placeholder email address`);
      }
    }
  }
}

if (failures.length) {
  console.error('Release guard failed:');
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release guard passed for ${files.length} files.`);
