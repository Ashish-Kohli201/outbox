'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { api, post, copy, fmt, titleOf } from '@/lib/client';
import { confetti, buzz } from '@/lib/fun';
import { Rich } from '@/lib/rich';
import { toPlain } from '@/lib/mimehtml.js';
import { withSig } from '@/lib/sig';
import { cvBase64, cvBlobUrl } from '@/lib/cvpdf';

function linkLabel(u) {
  try {
    const h = new URL(u).hostname.replace(/^www\./, '');
    if (/linkedin\.com/.test(h)) return /\/posts\/|activity|feed\/update/.test(u) ? 'Open LinkedIn post' : 'Open on LinkedIn';
    if (/docs\.google\.com|forms\.gle/.test(h)) return 'Open form';
    return 'Open ' + h;
  } catch { return 'Open link'; }
}

const STEPS = ['Read', 'Draft', 'Review', 'Sent', 'Replied'];
function stepOf(st) { return { queued: 0, processing: 1, error: 1, review: 2, scheduled: 2, sent: 3, replied: 4, interview: 4, closed: 4, skipped: 2 }[st] ?? 2; }
function Stepper({ status }) {
  const at = stepOf(status);
  return (
    <ol className="stepper" aria-label="Progress">
      {STEPS.map((l, i) => <li key={l} className={i < at ? 'done' : i === at ? 'now' : ''}><span>{i < at ? '✓' : i + 1}</span>{l}</li>)}
    </ol>
  );
}
const pad = n => String(n).padStart(2, '0');
const localInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function presets() {
  const at = (days, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
  const mon = new Date(); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7)); mon.setHours(9, 0, 0, 0);
  const soon = new Date(Date.now() + 2 * 36e5); soon.setMinutes(0, 0, 0);
  return [['Tomorrow 9 AM', at(1, 9)], ['Tomorrow 6 PM', at(1, 18)], ['Monday 9 AM', mon], ['In ~2 hours', new Date(soon.getTime() + 36e5)]];
}
const whenLabel = d => new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function ItemPage() {
  const { id } = useParams();
  const router = useRouter();
  const [it, setIt] = useState(null);
  const [kids, setKids] = useState([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [instr, setInstr] = useState('');
  const [people, setPeople] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [cvChoice, setCvChoice] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [me, setMe] = useState(null);
  const [cvBusy, setCvBusy] = useState('');
  const [sched, setSched] = useState(false);
  const [schedAt, setSchedAt] = useState('');
  const [stamped, setStamped] = useState(false);

  const say = m => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const apply = d => { if (d.item) setIt(d.item); if (d.children) setKids(d.children); };
  const act = async (action, extra = {}, msg) => {
    setBusy(action);
    try { apply(await post(`/api/items/${id}/action`, { action, ...extra })); if (msg) say(msg); }
    catch (e) { say(e.message); }
    setBusy('');
  };
  const save = async patch => { try { apply(await api(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })); } catch (e) { say(e.message); } };

  useEffect(() => {
    api(`/api/items/${id}`).then(d => {
      apply(d);
      setPeople((d.item.people || []).map(p => ({ ...p, name: '', email: '' })));
      setCvChoice('tailored');
    }).catch(e => say(e.message));
    api('/api/settings').then(setCfg).catch(() => {});
    api('/api/profile').then(d => setMe(d.profile)).catch(() => {});
  }, [id]);

  // While drafting: poll, and nudge the server if nothing has picked it up (it never waits for the next cron).
  const status = it?.status, updated = it?.updated_at, created = it?.created_at;
  useEffect(() => {
    if (status !== 'queued' && status !== 'processing') return;
    const tick = async () => {
      try {
        const d = await api(`/api/items/${id}`);
        const age = Date.now() - Date.parse(d.item.status === 'queued' ? d.item.created_at : d.item.updated_at);
        if (d.item.status === 'review' || d.item.status === 'error') apply(d);
        else if (age > (d.item.status === 'queued' ? 12000 : 100000)) act('process', { auto: true });
      } catch {}
    };
    const t = setInterval(tick, 4000);
    return () => clearInterval(t);
  }, [status, updated, id]);

  // Tailor the CV in the background as soon as the draft is ready, so "Tailored" is already waiting.
  const autoTailored = useRef(false);
  useEffect(() => {
    if (status === 'review' && it && !it.cv && !autoTailored.current && (it.email?.body || it.form?.length)) {
      autoTailored.current = true;
      post(`/api/items/${id}/action`, { action: 'tailorCv' }).then(apply).catch(() => {});
    }
  }, [status, it?.cv, id]);

  const ensureTailored = async () => {
    if (it.cv) return it.cv;
    const d = await post(`/api/items/${id}/action`, { action: 'tailorCv' });
    apply(d);
    return d.item.cv;
  };
  const needsPdf = c => c === 'tailored' || c === 'master';
  const cvData = async choice => (choice === 'tailored' ? await ensureTailored() : me?.cv_data);
  const previewCv = async (choice, download) => {
    if (String(choice).startsWith('file:')) { window.open(`/api/cvs?id=${choice.slice(5)}`, '_blank'); return; }
    setCvBusy('preview');
    try {
      const url = await cvBlobUrl(await cvData(choice), me?.cv_data);
      const a = document.createElement('a'); a.href = url; a.target = '_blank';
      if (download) a.download = `${(me?.name || 'CV').replace(/[^\w -]/g, '').trim().replace(/\s+/g, '_')}_CV.pdf`;
      a.click();
    } catch (e) { say(e.message); }
    setCvBusy('');
  };
  const tailorNow = async () => { setCvBusy('tailor'); try { apply(await post(`/api/items/${id}/action`, { action: 'tailorCv' })); say('CV tailored'); } catch (e) { say(e.message); } setCvBusy(''); };
  const cvWhat = () => (cvChoice === 'none' ? 'without a CV' : cvChoice === 'tailored' ? 'with the tailored CV' : cvChoice === 'master' ? 'with your master CV' : `with "${(cfg?.cvs || []).find(c => 'file:' + c.id === cvChoice)?.label || 'CV'}"`);
  const pdfFor = async () => (needsPdf(cvChoice) ? await cvBase64(await cvData(cvChoice), me?.cv_data) : undefined);
  const approve = async () => {
    if (!confirm(`Send to ${it.email?.to || '(no email)'} ${cvWhat()}?`)) return;
    setBusy('approve');
    try {
      apply(await post(`/api/items/${id}/action`, { action: 'approve', cv: cvChoice, pdf: await pdfFor() }));
      buzz([30, 40, 60]); confetti(); setStamped(true); setTimeout(() => setStamped(false), 2200);
      say('Sent! Follow-up drafts itself in 4 days.');
    } catch (e) { say(e.message); }
    setBusy('');
  };
  // No Gmail connected: open a ready-to-send compose window (the CV can't ride along - download it from above).
  const composeInGmail = () => {
    const body = toPlain(withSig(e.body, sigNow));
    const q = new URLSearchParams({ view: 'cm', fs: '1', to: e.to || '', su: e.subject || '', body });
    window.open('https://mail.google.com/mail/?' + q.toString(), '_blank');
  };
  const schedule = async when => {
    const d = new Date(when);
    if (!confirm(`Send to ${it.email?.to || '(no email)'} ${cvWhat()} on ${whenLabel(d)}? You can cancel until then.`)) return;
    setBusy('schedule');
    try {
      apply(await post(`/api/items/${id}/action`, { action: 'schedule', at: d.toISOString(), cv: cvChoice, pdf: await pdfFor() }));
      setSched(false); buzz(25); say('Scheduled. It sends itself - cancel any time.');
    } catch (e) { say(e.message); }
    setBusy('');
  };

  if (!it) return <p className="muted" style={{ marginTop: 30 }}>Loading…</p>;
  const working = it.status === 'queued' || it.status === 'processing' || busy === 'process';
  const e = it.email || {};
  const sigs = cfg?.prefs?.signatures || [];
  const sigNow = sigs.find(x => x.id === e.sig) || sigs.find(x => x.id === cfg?.prefs?.defaultSignature) || sigs[0] || { id: '', text: '' };
  const isCompany = it.kind === 'cold_company' || (!e.to && (it.people || []).length > 0);

  return (
    <>
      <p style={{ marginTop: 16 }}><Link href="/" className="small">← Inbox</Link></p>
      <h1>{titleOf(it)}</h1>
      <Stepper status={it.status} />
      <p className="muted">{it.kind ? <span className="pill">{it.kind.replace('_', ' ')}</span> : null}{it.status}{it.sent_at ? ` · sent ${fmt(it.sent_at)}` : ''}</p>

      {working && <div className="box"><span className="spin" /> Drafting…</div>}

      {it.status === 'error' && <div className="box">
        <p className="note err">{it.error}</p>
        <div className="row" style={{ marginTop: 8 }}><button className="btn primary" onClick={() => act('process')}>Try again</button></div>
      </div>}

      {!working && it.info?.summary && <div className="box">
        <div className="note">{it.info.summary}{it.info.fitReason ? `\n\nFit: ${it.info.fit} - ${it.info.fitReason}` : ''}{it.info.angle ? `\nAngle: ${it.info.angle}` : ''}{it.info.deadline ? `\nDeadline: ${it.info.deadline}` : ''}</div>
        {it.info.missing?.length > 0 && <p className="note warn" style={{ marginTop: 8 }}>Check: {it.info.missing.join('; ')}</p>}
        {it.info.applyUrl && <p style={{ marginTop: 8 }}><a className="btn" href={it.info.applyUrl} target="_blank" rel="noopener">Open application</a></p>}
      </div>}

      {stamped && <div className="sent-stamp" aria-hidden="true"><span>SENT</span><small>{fmt(new Date())}</small></div>}

      {it.status === 'scheduled' && <div className="box sched-box">
        <h2>⏰ Scheduled for {whenLabel(e.sendAt)}</h2>
        <p className="muted small">To {e.to} · {e.sendCv === 'none' ? 'no CV' : e.sendCv === 'tailored' ? 'tailored CV' : e.sendCv === 'master' ? 'master CV' : 'CV: ' + ((cfg?.cvs || []).find(c => 'file:' + c.id === e.sendCv)?.label || 'file')}. </p>
        <details><summary>See the email</summary><div className="note"><b>{e.subject}</b>{'\n\n'}{e.body}</div></details>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn send" disabled={!!busy} onClick={() => { if (confirm('Send it right now instead?')) act('sendNow', {}, 'Sent').then(confetti); }}>Send now</button>
          <button className="btn" disabled={!!busy} onClick={() => act('unschedule', {}, 'Back in your drafts')}>Cancel & edit</button>
        </div>
      </div>}
      {e.sendError && it.status === 'review' && <p className="note err">Scheduled send failed: {e.sendError}</p>}

      {!working && ['review', 'scheduled'].includes(it.status) && <div className="box">
        {it.info?.research?.text ? <details>
          <summary>🌐 What I found online about {it.info.research.company}</summary>
          <div className="note">{it.info.research.text}</div>
          {it.info.research.sources?.length > 0 && <p className="small muted">Sources: {it.info.research.sources.map((x, i) => <a key={i} href={x.url} target="_blank" rel="noopener">{(x.title || '').slice(0, 28)}</a>).reduce((a, x) => [...a, ' · ', x], []).slice(1)}</p>}
          <div className="row"><button className="btn ghost small" disabled={!!busy} onClick={() => act('research', { company: prompt('Company name', it.info.research.company) || undefined }, 'Researched again - tap Rewrite to use it')}>{busy === 'research' ? <span className="spin" /> : 'Search again'}</button></div>
        </details> : <div className="row">
          <button className="btn small" disabled={!!busy} onClick={() => { const c = prompt('Company name to look up', it.info?.company || ''); if (c) act('research', { company: c }, 'Found something - tap Rewrite to use it'); }}>{busy === 'research' ? <span className="spin" /> : '🌐 Research online'}</button>
        </div>}
      </div>}

      {/* SOURCE: the original post / link / screenshots */}
      {!working && <div className="box">
        <h2>The original</h2>
        <div className="row">
          {(it.info?.links || []).map(u => <a key={u} className="btn" href={u} target="_blank" rel="noopener">{linkLabel(u)} ↗</a>)}
          {!(it.info?.links || []).length && !(it.files || []).length && null}
        </div>
        {it.info?.loginWall && <p className="note warn" style={{ marginTop: 8 }}>LinkedIn blocked the preview - open the original.</p>}
        {(it.files || []).length > 0 && <div className="row" style={{ marginTop: 8 }}>
          {it.files.map(f => f.mime?.startsWith('image/')
            ? <a key={f.path} href={`/api/file?p=${encodeURIComponent(f.path)}`} target="_blank" rel="noopener"><img src={`/api/file?p=${encodeURIComponent(f.path)}`} alt={f.name} style={{ height: 90, borderRadius: 8, border: '1px solid var(--line)' }} /></a>
            : <a key={f.path} className="btn ghost" href={`/api/file?p=${encodeURIComponent(f.path)}`} target="_blank" rel="noopener">📄 {f.name}</a>)}
        </div>}
        <details style={{ marginTop: 8 }}><summary>What the app read</summary><div className="note">{it.source_text || it.raw_text || '(attachments only)'}</div></details>
      </div>}

      {/* FORM ANSWERS */}
      {!working && it.form?.length > 0 && <div className="box">
        <h2>Application answers</h2>
        {it.form.map((q, i) => (
          <div key={i} className="q">
            <label>{i + 1}. {q.q} {q.required ? '*' : ''} {q.limit ? `(${q.limit})` : ''}</label>
            {q.options?.length > 0 && <p className="muted small">Options: {q.options.join(' · ')}</p>}
            <textarea rows={q.type === 'paragraph' ? 6 : 2} defaultValue={q.a}
              onBlur={ev => { if (ev.target.value !== q.a) { const f = it.form.map((x, j) => j === i ? { ...x, a: ev.target.value } : x); save({ form: f }); } }} />
            <button className="btn ghost" onClick={() => { copy(it.form[i].a); say('Copied'); }}>Copy</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => { copy(it.form.map((q, i) => `${i + 1}. ${q.q}\n${q.a}`).join('\n\n')); say('All answers copied'); }}>Copy all</button>
          <button className="btn ghost" disabled={!!cvBusy} onClick={() => previewCv('tailored', true)}>{cvBusy ? <span className="spin" /> : '⬇️ Tailored CV for upload'}</button>
        </div>
      </div>}

      {/* COMPANY PLAYBOOK */}
      {!working && isCompany && it.status === 'review' && <div className="box">
        <h2>People to reach</h2>
        {people.map((p, i) => (
          <div key={i} className="q">
            <strong>{p.role}</strong>
            <p className="muted small" style={{ margin: '2px 0 6px' }}>{p.why} · <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(p.search || p.role + ' ' + (it.info?.company || ''))}`} target="_blank" rel="noopener">Search LinkedIn</a></p>
            <div className="row">
              <input placeholder="Name" value={p.name} onChange={ev => setPeople(people.map((x, j) => j === i ? { ...x, name: ev.target.value } : x))} style={{ flex: 1, minWidth: 130 }} />
              <input placeholder="Email" type="email" value={p.email} onChange={ev => setPeople(people.map((x, j) => j === i ? { ...x, email: ev.target.value } : x))} style={{ flex: 1, minWidth: 170 }} />
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={() => setPeople([...people, { role: 'Someone else', why: '', name: '', email: '' }])}>Add person</button>
          <button className="btn primary" disabled={!!busy || !people.some(p => p.email)} onClick={() => act('people', { people: people.filter(p => p.email) }, 'Drafted personal emails')}>
            {busy === 'people' ? <><span className="spin" /> Drafting</> : 'Draft emails for these'}</button>
        </div>
      </div>}

      {kids.length > 0 && <div className="box">
        <h2>Personal emails</h2>
        {kids.map(k => <Link key={k.id} href={`/item/${k.id}`} className="lead" style={{ marginTop: 8 }}>
          <span className="t">{k.email?.toName || k.email?.to}</span> <span className="m">{k.status}{k.sent_at ? ' · sent ' + fmt(k.sent_at) : ''}</span></Link>)}
      </div>}

      {/* EMAIL */}
      {!working && it.status === 'review' && (e.body || e.to) && <div className="box">
        <h2>Email</h2>
        <div className="row">
          <div style={{ flex: 1, minWidth: 140 }}><label>Name</label><input defaultValue={e.toName} onBlur={ev => save({ email: { ...it.email, toName: ev.target.value } })} /></div>
          <div style={{ flex: 2, minWidth: 190 }}><label>To</label><input type="email" defaultValue={e.to} onBlur={ev => save({ email: { ...it.email, to: ev.target.value.trim() } })} /></div>
        </div>
        <label>Subject</label><input defaultValue={e.subject} key={'s' + e.aiBody} onBlur={ev => save({ email: { ...it.email, subject: ev.target.value } })} />
        <label>Body</label><textarea rows={12} defaultValue={e.body} key={'b' + e.aiBody} onBlur={ev => save({ email: { ...it.email, body: ev.target.value } })} />
        {sigs.length > 0 && <div style={{ marginTop: 8 }}>
          <label htmlFor="sig">Signature</label>
          <select id="sig" value={sigNow.id} onChange={ev => save({ email: { ...it.email, sig: ev.target.value } })}>
            {sigs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <div className="note small" style={{ marginTop: 6 }}><Rich text={sigNow.text} /></div>
        </div>}
        <div className="row" style={{ marginTop: 8 }}>
          <input value={instr} onChange={ev => setInstr(ev.target.value)} placeholder="Make it shorter, more formal…" style={{ flex: 1, minWidth: 180 }} />
          <button className="btn" disabled={!!busy} onClick={() => act('rewrite', { instruction: instr }, 'Rewritten')}>{busy === 'rewrite' ? <span className="spin" /> : 'Rewrite'}</button>
        </div>
        <div className="q">
          <h3 style={{ margin: '0 0 8px' }}>Attach your CV?</h3>
          <div className="seg" role="group" aria-label="CV">
            {[['none', 'No CV'], ['tailored', '✨ Tailored'], ...((cfg?.cvs || []).length ? cfg.cvs.map(c => ['file:' + c.id, (it.info?.cvPick === c.id ? '⭐ ' : '') + c.label]) : [['master', 'Master CV']])].map(([k, l]) =>
              <button key={k} aria-pressed={cvChoice === k} onClick={() => setCvChoice(k)}>{l}</button>)}
          </div>
          {cvChoice === 'tailored' && <div style={{ marginTop: 10 }}>
            {it.cv_changes?.length > 0 ? <div className="note">What changed for this role:{'\n'}{it.cv_changes.map(c => '• ' + c).join('\n')}</div>
              : (cvBusy === 'tailor' || !it.cv) ? <p className="muted small"><span className="spin" /> Tailoring…</p> : null}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" disabled={!!cvBusy} onClick={tailorNow}>{cvBusy === 'tailor' ? <><span className="spin" /> Tailoring</> : it.cv ? 'Re-tailor' : 'Tailor it now'}</button>
              <button className="btn ghost" disabled={!!cvBusy} onClick={() => previewCv('tailored')}>{cvBusy === 'preview' ? <span className="spin" /> : '👀 Preview'}</button>
              <button className="btn ghost" disabled={!!cvBusy} onClick={() => previewCv('tailored', true)}>⬇️ Download</button>
            </div>
          </div>}
        </div>
        <div className="actionbar">
          {cfg && !cfg.gmail ? <>
            <button className="btn send" disabled={!e.to} onClick={() => { composeInGmail(); }}>✉️ Open in Gmail</button>
            <button className="btn" onClick={() => act('applied', {}, 'Marked as sent')}>I sent it</button>
          </> : <>
            <button className="btn send" disabled={!!busy || !!cvBusy} onClick={approve}>{busy === 'approve' ? <><span className="spin" /> Sending</> : '✈️ Approve & send'}</button>
            <button className="btn" disabled={!!busy || !!cvBusy} onClick={() => { setSched(!sched); if (!schedAt) setSchedAt(localInput(presets()[0][1])); }} aria-expanded={sched}>⏰ Later</button>
          </>}
          <button className="btn ghost" onClick={() => act('applied', {}, 'Marked as applied')}>Mark applied</button>
          <button className="btn ghost" onClick={() => act('status', { status: 'skipped' }, 'Skipped')}>Skip</button>
        </div>
        {sched && cfg?.gmail && <div className="sheet">
          <h3 style={{ margin: '0 0 8px' }}>Send it later</h3>
          <div className="row">{presets().map(([l, d]) => <button key={l} className="btn small" disabled={!!busy} onClick={() => schedule(d)}>{l}</button>)}</div>
          <label htmlFor="sat">Or pick your own time</label>
          <div className="row"><input id="sat" type="datetime-local" value={schedAt} onChange={ev => setSchedAt(ev.target.value)} style={{ flex: 1, minWidth: 190 }} />
            <button className="btn primary" disabled={!!busy || !schedAt} onClick={() => schedule(schedAt)}>{busy === 'schedule' ? <span className="spin" /> : 'Schedule'}</button></div>
        </div>}
      </div>}

      {/* FOLLOW-UP */}
      {it.status === 'sent' && it.thread_id && <div className="box">
        <h2>Follow-up</h2>
        {it.follow?.body ? <>
          <textarea rows={7} defaultValue={it.follow.body} key={it.follow.aiBody} onBlur={ev => save({ follow: { ...it.follow, body: ev.target.value } })} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn send" disabled={!!busy} onClick={() => { if (confirm('Send this follow-up now?')) act('sendFollow', {}, 'Follow-up sent').then(confetti); }}>{busy === 'sendFollow' ? <span className="spin" /> : 'Approve & send'}</button>
            <button className="btn ghost" disabled={!!busy} onClick={() => act('draftFollow')}>Redraft</button>
          </div>
        </> : <>
          <p className="muted small">{it.next_follow_at ? `Next follow-up ${fmt(it.next_follow_at)}` : 'No more follow-ups'}</p>
          <button className="btn" disabled={!!busy} onClick={() => act('draftFollow')}>{busy === 'draftFollow' ? <span className="spin" /> : 'Draft one now'}</button>
        </>}
      </div>}

      {/* REPLIES */}
      {['replied', 'interview'].includes(it.status) && it.reply && <div className="box">
        <h2>Their reply <span className="pill">{it.reply.category}</span></h2>
        <div className="note">{it.reply.text}</div>
        {it.reply.body ? <>
          {it.reply.todo && <p className="note warn" style={{ marginTop: 8 }}>Before sending: {it.reply.todo}</p>}
          <label>Your response</label>
          <textarea rows={8} defaultValue={it.reply.body} key={it.reply.aiBody} onBlur={ev => save({ reply: { ...it.reply, body: ev.target.value } })} />
          <div className="row" style={{ marginTop: 8 }}>
            {it.thread_id ? <button className="btn send" disabled={!!busy} onClick={() => { if (confirm('Send your response now?')) act('sendReply', {}, 'Response sent').then(confetti); }}>{busy === 'sendReply' ? <span className="spin" /> : 'Approve & send'}</button>
              : <button className="btn primary" onClick={() => { copy(it.reply.body); say('Copied'); }}>Copy response</button>}
          </div>
        </> : <p className="muted small">{it.reply.sentAt ? 'Replied' : ''}</p>}
      </div>}

      {['sent', 'replied', 'interview'].includes(it.status) && <div className="box">
        <details><summary>They replied on LinkedIn / WhatsApp</summary>
          <textarea rows={4} value={replyText} onChange={ev => setReplyText(ev.target.value)} placeholder="Paste their message" />
          <button className="btn primary" style={{ marginTop: 8 }} disabled={!replyText.trim() || !!busy} onClick={() => act('logReply', { text: replyText }, 'Response drafted').then(() => setReplyText(''))}>{busy === 'logReply' ? <span className="spin" /> : 'Draft my response'}</button>
        </details>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ghost" onClick={() => act('status', { status: 'interview' })}>Mark interview</button>
          <button className="btn ghost" onClick={() => act('status', { status: 'closed' }, 'Closed')}>Close</button>
        </div>
      </div>}

      {it.cv_tweaks?.length > 0 && <div className="box"><details><summary>CV tweaks for this one</summary><ul>{it.cv_tweaks.map((t, i) => <li key={i}>{t}</li>)}</ul></details></div>}

      <div className="box">
        <details><summary>What you dumped</summary><div className="note">{it.raw_text || '(attachments only)'}</div></details>
        <div className="row" style={{ marginTop: 8 }}>
          {['closed', 'skipped'].includes(it.status) && <button className="btn" onClick={() => act('status', { status: 'review' })}>Reopen</button>}
          {!working && <button className="btn ghost" onClick={() => act('process', {}, 'Redrafted')}>Re-read & redraft</button>}
          <button className="btn ghost" onClick={async () => { if (confirm('Delete this lead?')) { await api(`/api/items/${id}`, { method: 'DELETE' }); router.push('/'); } }}>Delete</button>
        </div>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
