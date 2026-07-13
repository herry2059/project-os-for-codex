import {
  DEFAULT_WORKSPACE_ID,
  upsertKnowledgeByRef,
} from './store.js';

const curated = [
  {
    ref: 'curated:visible-progress',
    type: 'principle',
    businessLine: 'project execution',
    title: 'Progress must be visible without asking the agent',
    body: 'A useful AI project system should show current state, recent commits, next step, owner, and risk before anyone opens a chat transcript.',
    tags: ['progress', 'ai-agents', 'handoff'],
  },
  {
    ref: 'curated:small-slices',
    type: 'method',
    businessLine: 'project execution',
    title: 'Ship one vertical slice at a time',
    body: 'Large AI changes are hard to review. Keep work in small slices with explicit acceptance checks and a resumable handoff note.',
    tags: ['delivery', 'review', 'acceptance'],
  },
  {
    ref: 'curated:git-trace',
    type: 'method',
    businessLine: 'project execution',
    title: 'Let Git become the progress trail',
    body: 'If the AI already changes files, the system can turn that work into structured events and commits instead of asking humans to maintain a separate status sheet.',
    tags: ['git', 'audit', 'progress'],
  },
];

const n = upsertKnowledgeByRef(curated.map((item) => ({ ...item, source: 'curated', workspaceId: DEFAULT_WORKSPACE_ID })));
console.log(`upserted ${n} curated knowledge items`);
