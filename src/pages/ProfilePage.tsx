import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, X, UserCircle2, Sparkles } from 'lucide-react';
import { myProfile, saveProfile, type MemberProfile, type ProfileSkill, type TeamRole } from '@/lib/saas';

/**
 * One-action-per-step member profile wizard informed by SFIA, O*NET, and Belbin.
 * Role, level, skills, domains, boundaries, authority, and capacity help AI avoid overlapping assignments.
 * Backend contract (Codex): GET /api/profile/me and PUT /api/profile/me. See saas.ts for the full schema.
 */
type StepKey =
  | 'role' | 'seniority' | 'skills' | 'domains' | 'teamRole'
  | 'responsibilities' | 'boundaries' | 'authority' | 'capacity' | 'bio';

const STEPS: { key: StepKey; title: string; hint: string }[] = [
  { key: 'role', title: 'Your role', hint: 'What is your primary role, such as product, frontend, operations, design, or project management?' },
  { key: 'seniority', title: 'Your responsibility level', hint: 'Use an SFIA-inspired scale from 1, needs guidance, to 5, sets standards. AI uses it to match task difficulty.' },
  { key: 'skills', title: 'Your skills and proficiency', hint: 'Add capability tags with honest proficiency levels, such as React - independent or Python - beginner.' },
  { key: 'domains', title: 'Your domain experience', hint: 'Which business domains do you understand, such as commerce, education, government, or content operations?' },
  { key: 'teamRole', title: 'Your team tendency', hint: 'Are you strongest at execution, collaboration, or analysis? This helps balance assignments.' },
  { key: 'responsibilities', title: 'Your responsibilities', hint: 'Describe your primary ownership so assignments do not overlap.' },
  { key: 'boundaries', title: 'Your boundaries', hint: 'What is outside your role or expertise? Clear boundaries prevent conflicting assignments.' },
  { key: 'authority', title: 'Your decision authority', hint: 'Which decisions can you make independently, and which require approval?' },
  { key: 'capacity', title: 'Your available capacity', hint: 'Estimate your availability, such as 20 hours per week, full time, or limited involvement.' },
  { key: 'bio', title: 'One-line introduction', hint: 'Summarize the value you bring to a project.' },
];

const SENIORITY = [
  { v: 1, label: '1 - Needs guidance' },
  { v: 2, label: '2 - Works with guidance' },
  { v: 3, label: '3 - Works independently' },
  { v: 4, label: '4 - Leads and reviews others' },
  { v: 5, label: '5 - Expert who sets standards' },
];
const TEAM_ROLES: { v: TeamRole; label: string; desc: string }[] = [
  { v: 'action', label: 'Action', desc: 'Drive execution and finish work' },
  { v: 'people', label: 'People', desc: 'Coordinate, communicate, and connect resources' },
  { v: 'thought', label: 'Thought', desc: 'Create, analyze, and provide specialist depth' },
];

export default function ProfilePage() {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<MemberProfile>({ skills: [], domains: [] });
  const [skillForm, setSkillForm] = useState<ProfileSkill>({ name: '', level: 3, kind: 'technical' });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    myProfile().then((d) => d && setP(normalizeProfile(d)));
  }, []);

  const normalizeProfile = (d: MemberProfile): MemberProfile => {
    const rawSkills = (d.skills || []) as Array<ProfileSkill | string>;
    const skills: ProfileSkill[] = rawSkills
      .map((s) => {
        if (typeof s === 'string') return { name: s, level: 3, kind: 'technical' as const };
        return { name: s.name, level: s.level || 3, kind: s.kind || 'technical', evidence: s.evidence };
      })
      .filter((s) => Boolean(s.name));
    return { ...d, domains: d.domains || [], skills };
  };
  const set = (k: keyof MemberProfile, v: unknown) => setP((prev) => ({ ...prev, [k]: v }));
  const addSkill = () => {
    const name = skillForm.name.trim();
    if (!name) return;
    const list = p.skills || [];
    if (!list.some((s) => s.name === name)) set('skills', [...list, { ...skillForm, name }]);
    setSkillForm({ name: '', level: 3, kind: 'technical' });
  };
  const removeSkill = (name: string) => set('skills', (p.skills || []).filter((x) => x.name !== name));
  const addTag = (field: 'domains') => {
    const s = tagInput.trim();
    if (!s) return;
    const list = (p[field] as string[]) || [];
    if (!list.includes(s)) set(field, [...list, s]);
    setTagInput('');
  };
  const removeTag = (field: 'domains', s: string) =>
    set(field, ((p[field] as string[]) || []).filter((x) => x !== s));

  const cur = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = async () => {
    setSaving(true);
    await saveProfile(p);
    setSaving(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
          <Check size={26} />
        </div>
        <h2 className="text-lg font-semibold text-white">Profile saved</h2>
        <p className="mt-2 text-sm text-white/50">
          AI work allocation can now use your level, skills, domains, team tendency, and boundaries. Verified work may enrich the profile over time.
        </p>
        <button className="btn-soft mt-6" onClick={() => { setDone(false); setStep(0); }}>Edit profile</button>
      </div>
    );
  }

  const skillField = (
    <div>
      <div className="grid gap-2 md:grid-cols-[1fr_130px_120px_auto]">
        <input
          className="input"
          placeholder="Skill, such as React or customer communication"
          value={skillForm.name}
          onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
          autoFocus
        />
        <select className="input" value={skillForm.level} onChange={(e) => setSkillForm({ ...skillForm, level: Number(e.target.value) })}>
          {SENIORITY.map((s) => <option key={s.v} value={s.v}>Level {s.v}</option>)}
        </select>
        <select className="input" value={skillForm.kind} onChange={(e) => setSkillForm({ ...skillForm, kind: e.target.value as ProfileSkill['kind'] })}>
          <option value="technical">Technical skill</option>
          <option value="essential">Essential skill</option>
        </select>
        <button className="btn-soft shrink-0" onClick={addSkill}><Plus size={15} /> Add</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(p.skills || []).length === 0 && <span className="text-xs text-white/30">No skills yet</span>}
        {(p.skills || []).map((s) => (
          <span key={`${s.name}-${s.kind}`} className="inline-flex items-center gap-1 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-100">
            {s.name} - level {s.level} - {s.kind === 'technical' ? 'technical' : 'essential'}
            <button onClick={() => removeSkill(s.name)} className="text-cyan-100/60 hover:text-white"><X size={12} /></button>
          </span>
        ))}
      </div>
    </div>
  );

  const tagField = (field: 'domains', placeholder: string) => (
    <div>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder={placeholder}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(field))}
          autoFocus
        />
        <button className="btn-soft shrink-0" onClick={() => addTag(field)}><Plus size={15} /> Add</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {((p[field] as string[]) || []).length === 0 && <span className="text-xs text-white/30">Nothing added yet</span>}
        {((p[field] as string[]) || []).map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-100">
            {s}
            <button onClick={() => removeTag(field, s)} className="text-cyan-100/60 hover:text-white"><X size={12} /></button>
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs text-white/40">
          <span className="inline-flex items-center gap-1.5"><UserCircle2 size={14} /> Profile wizard</span>
          <span>{step + 1} / {STEPS.length}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="card p-6 md:p-8">
        <div className="mb-1 text-center text-xs text-white/40">Step {step + 1}</div>
        <h2 className="text-center text-2xl font-semibold text-white">{cur.title}</h2>
        <p className="mt-2 text-center text-sm text-white/45">{cur.hint}</p>

        <div className="mt-6">
          {cur.key === 'role' && (
            <input className="input" placeholder="For example: frontend developer or project manager" value={p.role || ''} onChange={(e) => set('role', e.target.value)} autoFocus />
          )}
          {cur.key === 'seniority' && (
            <div className="grid gap-2">
              {SENIORITY.map((s) => (
                <button
                  key={s.v}
                  onClick={() => set('seniority', s.v)}
                  className={`rounded-xl2 border px-4 py-2.5 text-left text-sm transition ${p.seniority === s.v ? 'border-cyan-200/40 bg-cyan-300/10 text-white' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {cur.key === 'skills' && skillField}
          {cur.key === 'domains' && tagField('domains', 'For example: commerce, education, or government. Press Enter to add.')}
          {cur.key === 'teamRole' && (
            <div className="grid gap-2 md:grid-cols-3">
              {TEAM_ROLES.map((t) => (
                <button
                  key={t.v}
                  onClick={() => set('teamRole', t.v)}
                  className={`rounded-xl2 border p-4 text-left transition ${p.teamRole === t.v ? 'border-cyan-200/40 bg-cyan-300/10' : 'border-white/10 hover:bg-white/5'}`}
                >
                  <div className="text-sm font-medium text-white">{t.label}</div>
                  <div className="mt-1 text-xs text-white/45">{t.desc}</div>
                </button>
              ))}
            </div>
          )}
          {cur.key === 'responsibilities' && (
            <textarea className="input min-h-[110px]" placeholder="For example: own frontend implementation and integration" value={p.responsibilities || ''} onChange={(e) => set('responsibilities', e.target.value)} autoFocus />
          )}
          {cur.key === 'boundaries' && (
            <textarea className="input min-h-[110px]" placeholder="For example: no backend deployment, contracts, or finance work" value={p.boundaries || ''} onChange={(e) => set('boundaries', e.target.value)} autoFocus />
          )}
          {cur.key === 'authority' && (
            <textarea className="input min-h-[110px]" placeholder="For example: may choose frontend tools; releases require administrator approval" value={p.authority || ''} onChange={(e) => set('authority', e.target.value)} autoFocus />
          )}
          {cur.key === 'capacity' && (
            <input className="input" placeholder="For example: 20 hours per week, full time, or limited" value={p.capacity || ''} onChange={(e) => set('capacity', e.target.value)} autoFocus />
          )}
          {cur.key === 'bio' && (
            <textarea className="input min-h-[90px]" placeholder="For example: frontend engineer who simplifies complex interactions and ships reliably" value={p.bio || ''} onChange={(e) => set('bio', e.target.value)} autoFocus />
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button className="btn-ghost" onClick={() => (step === 0 ? window.history.back() : setStep(step - 1))}>
            <ArrowLeft size={14} /> {step === 0 ? 'Exit' : 'Previous'}
          </button>
          {last ? (
            <button className="btn-primary" onClick={finish} disabled={saving}>
              <Check size={15} /> {saving ? 'Saving…' : 'Finish'}
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setStep(step + 1)}>
              Next <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-white/30">
        <Sparkles size={12} /> Informed by SFIA, O*NET, and Belbin. AI allocation uses your profile, which may be enriched by verified work.
      </p>
    </div>
  );
}
