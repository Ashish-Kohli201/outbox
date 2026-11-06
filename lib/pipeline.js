import { getItem, updateItem, insertItem, loadFiles, recordStyle, listCvs, storedPdf, savePdf, getProfile } from './db';
import { researchCompany } from './research';
import { cvOutline, buildTailored } from './cvguard';
import { prefs } from './prefs';
import { pickSig, withSig } from './sig';
import { llmJSON } from './llm';
import { extractUrls, fetchPage } from './fetchpage';
import { contextBlock, RULES } from './context';
import { sendMail, getThread, threadToText } from './gmail';
import { FOLLOW_DAYS } from './defaults';

/** Who is writing: name and a one-line description, for prompts. */
async function who() {
  const P = await getProfile();
  return { NAME: P.name || 'the sender', HEAD: P.headline || 'a job seeker', P };
}

const DAY = 864e5;
const today = () => new Date().toDateString();

/* ---------------- 1. Understand + draft a new dump ---------------- */

export async function processItem(id, { auto = false } = {}) {
  const { NAME, HEAD, P } = await who();
  const it = await getItem(id);
  // Automatic triggers (page open, cron, share) must not double-run a draft that is already in progress.
  if (auto && it.status === 'processing' && Date.now() - Date.parse(it.updated_at) < 90000) return it;
  if (auto && !['queued', 'processing'].includes(it.status)) return it;
  await updateItem(id, { status: 'processing', error: null });
  try {
    const files = await loadFiles(it.files);
    const links = extractUrls(it.raw_text).slice(0, 3);
    const pages = await Promise.all(links.map(u => fetchPage(u).catch(e => ({ url: u, text: '', error: e.message }))));
    const parsedForm = pages.flatMap(p => p.form || []);
    const source = [
      `WHAT ${NAME.toUpperCase()} DUMPED:\n${it.raw_text || '(only attachments)'}`,
      ...pages.map(p => `\nCONTENT OF ${p.url}${p.title ? ' (' + p.title + ')' : ''}:\n${p.loginWall ? '[Behind a LinkedIn login - could not read. Use the dump text and attachments.]' : (p.text || '[Could not load]')}`)
    ].join('\n').slice(0, 30000);

    const u = await llmJSON({ files, prompt: `You triage leads that ${NAME} (${HEAD}) dumps into their job-search inbox. A dump can be anything: a job post, a LinkedIn post, a form link, a screenshot of questions, a company name with a note like "they hired someone like me 2 years back", an email address, a recruiter message.

${source}
${files.length ? `\n${files.length} attachment(s) are included - read them carefully, they may contain the job or the questions.` : ''}
TODAY: ${today()}

Work out exactly what this is and what ${NAME} should do. Return JSON:
{
 "kind": "job_form | job_listing | cold_company | person | linkedin_post | recruiter_message | other",
 "company": "", "role": "",
 "title": "3-6 word headline for the inbox, e.g. \"Zepto - Founder's Office Intern\" or \"Kearney analyst form\". Never a URL, never a sentence.",
 "summary": "one line: what this is and the next step",
 "applyUrl": "", "deadline": "",
 "contactName": "", "contactEmail": "only if it appears verbatim in the source",
 "formQuestions": ${parsedForm.length ? '[] (already parsed exactly from the form)' : '[{"q": "exact wording", "type": "text|paragraph|choice|checkbox|dropdown|date|number|file", "options": ["for choice types"], "limit": "word/char limit if stated"}] - EVERY application question visible in the text or attachments, in order. [] if none.'},
 "people": [{"role": "specific title to contact", "why": "one line", "search": "LinkedIn people-search query, e.g. Founder's Office Zepto"}] - 2-4 entries when there is no named contact (always for cold_company). Never invent names.,
 "missing": ["anything ${NAME} must find or confirm"]
}` });

    const formQs = parsedForm.length ? parsedForm : (u.formQuestions || []);
    // Look the company up on the web (reuse an earlier lookup if the company is unchanged).
    const prev = it.info?.research;
    const research = u.company && !['person', 'other'].includes(u.kind)
      ? (prev && prev.company?.toLowerCase() === u.company.toLowerCase() ? prev : await researchCompany(u.company, u.role || '').catch(() => null))
      : prev || null;
    const cvs = await listCvs().catch(() => []);
    const ctx = await contextBlock();
    const w = await llmJSON({ files, maxTokens: 12000, prompt: `You are ${NAME}, writing as yourself.

${ctx}

THE LEAD:
${source}
WHAT IT IS: ${JSON.stringify({ kind: u.kind, company: u.company, role: u.role, summary: u.summary, contactName: u.contactName })}
${research?.text ? `
WHAT I FOUND ONLINE ABOUT ${u.company} (use it for a specific, current opening line - e.g. congratulate a recent round or launch. Use only claims stated here or in the lead; if unsure, leave it out):
${research.text}
` : ''}${cvs.length > 1 ? `
THEIR CV VERSIONS (pick the best one for this lead as "cvPick", the id): ${cvs.map(c => `${c.id} = ${c.label}`).join('; ')}
` : ''}
${RULES}

TASKS:
1. Outreach email to ${u.contactName || 'the most relevant person (start with "Dear [Name],")'} about this ${u.role || 'opportunity'} at ${u.company || 'the company'}. Follow his cold-email skeleton and the rules: short, one specific opening line, max two proof points.
2. Answer EVERY form question below, in order. First person, specific, only true facts from the context. Respect limits. For choice/dropdown questions answer with exactly one listed option; checkbox: listed options separated by "; ". If the answer needs a fact not in the context (e.g. expected stipend, notice period), write [confirm: ...].
${formQs.map((q, i) => `Q${i + 1} [${q.type}${q.limit ? ', limit ' + q.limit : ''}${q.options?.length ? ', options: ' + q.options.join(' | ') : ''}]: ${q.q}`).join('\n') || '(no form questions)'}
3. 2-4 CV tweaks for this specific lead (which bullets to lead with or reword) using only real facts.

Return JSON: {${cvs.length > 1 ? '"cvPick": "id of the best CV version", ' : ''}"subject": "", "body": "", "formAnswers": ["answer to Q1", "..."], "cvTweaks": [""], "fit": "high|medium|low", "fitReason": "one line", "angle": "which proof points you led with and why"}` });

    const form = formQs.map((q, i) => ({ ...q, a: (w.formAnswers || [])[i] || '' }));
    return await updateItem(id, {
      status: 'review', kind: u.kind || 'other', source_text: source.slice(0, 30000),
      info: { research: research || null, cvPick: cvs.some(c => c.id === w.cvPick) ? w.cvPick : '', title: String(u.title || '').slice(0, 80), links: [...new Set([...links, ...(u.applyUrl ? [u.applyUrl] : [])])], loginWall: pages.some(p => p.loginWall), company: u.company || '', role: u.role || '', summary: u.summary || '', applyUrl: u.applyUrl || '', deadline: u.deadline || '', missing: u.missing || [], fit: w.fit || '', fitReason: w.fitReason || '', angle: w.angle || '' },
      form, people: u.people || [],
      email: { to: u.contactEmail || '', toName: u.contactName || '', subject: w.subject || '', body: w.body || '', aiBody: w.body || '' },
      cv_tweaks: w.cvTweaks || []
    });
  } catch (e) {
    return await updateItem(id, { status: 'error', error: String(e.message || e) });
  }
}

/* ---------------- 2. Company playbook: one personal email per person ---------------- */

export async function draftForPeople(parentId, people) {
  const { NAME, HEAD, P } = await who();
  const p = await getItem(parentId);
  const ctx = await contextBlock();
  const made = [];
  for (const person of people.filter(x => x.email)) {
    const w = await llmJSON({ prompt: `You are ${NAME}, writing as yourself.\n\n${ctx}\n\nTHE LEAD:\n${(p.source_text || p.raw_text || '').slice(0, 12000)}\n${p.info?.research?.text ? '\nWHAT I FOUND ONLINE ABOUT THE COMPANY (use only what is stated here):\n' + p.info.research.text + '\n' : ''}\nWRITE TO: ${person.name || '[Name]'}${person.role ? ', ' + person.role : ''} at ${p.info?.company || 'the company'}.\n${person.note ? 'What ' + NAME + ' knows about them: ' + person.note : ''}\n\n${RULES}\nMake it personal to this person's role - why them specifically. Return JSON: {"subject": "", "body": ""}` });
    made.push(await insertItem({
      parent_id: parentId, status: 'review', kind: 'outreach', raw_text: `Outreach to ${person.name} (${person.role || ''})`,
      info: { company: p.info?.company || '', role: p.info?.role || '', summary: `Personal email to ${person.name}${person.role ? ', ' + person.role : ''}` },
      email: { to: person.email, toName: person.name || '', subject: w.subject || '', body: w.body || '', aiBody: w.body || '' }
    }));
  }
  return made;
}

/* ---------------- 3. Rewrite on instruction ---------------- */

export async function rewrite(id, instruction) {
  const { NAME, HEAD, P } = await who();
  const it = await getItem(id);
  const ctx = await contextBlock();
  const w = await llmJSON({ prompt: `You are ${NAME}.\n\n${ctx}\n\nLEAD:\n${(it.source_text || it.raw_text || '').slice(0, 10000)}\n${it.info?.research?.text ? '\nONLINE RESEARCH ON THE COMPANY:\n' + it.info.research.text + '\n' : ''}\nCURRENT EMAIL TO ${it.email?.toName || ''}:\nSubject: ${it.email?.subject}\n${it.email?.body}\n\nTHE SENDER'S INSTRUCTION: ${instruction || 'Make it sharper and more human.'}\n\n${RULES}\nReturn JSON: {"subject": "", "body": ""}` });
  return updateItem(id, { email: { ...it.email, subject: w.subject || it.email.subject, body: w.body || it.email.body, aiBody: w.body || it.email.body } });
}

/* ---------------- 4. Send (only ever on the user's approval) ---------------- */

/**
 * cv: 'none' | 'tailored' | 'file:<id>' (one of the user's uploaded CVs). The browser renders the tailored PDF (pdf).
 */
async function fileBase() { return ((await getProfile()).name || 'CV').replace(/[^\w -]/g, '').trim().replace(/\s+/g, '_') || 'CV'; }

async function cvAttachment(cv, pdf, itemId) {
  if (!cv || cv === 'none') return [];
  if (cv === 'tailored' || cv === 'master') {
    const b64 = pdf || await storedPdf(`sched/${itemId}.pdf`);
    if (!b64) throw new Error('CV PDF missing - try again.');
    return [{ filename: `${await fileBase()}_CV.pdf`, mime: 'application/pdf', b64 }];
  }
  const id = cv.replace(/^file:/, '');
  const list = await listCvs();
  const b64 = await storedPdf(`cv/${id}.pdf`);
  if (!b64) throw new Error('That CV file is missing - re-upload it in Settings.');
  const label = (list.find(c => c.id === id)?.label || 'CV').replace(/[^\w -]/g, '').trim().replace(/\s+/g, '_');
  return [{ filename: `${await fileBase()}_${label}.pdf`, mime: 'application/pdf', b64 }];
}

async function deliver(it, attachments, cv) {
  const sig = pickSig(await prefs(), it.email.sig);
  const s = await sendMail({ to: it.email.to, subject: it.email.subject, body: withSig(it.email.body, sig), attachments });
  await recordStyle('first', it.email.aiBody, it.email.body);
  const { sendAt, sendCv, sendError, ...email } = it.email;
  return updateItem(it.id, { email, status: 'sent', cv_sent: cv, thread_id: s.threadId, last_msg_id: s.messageId, sent_at: new Date().toISOString(), follow_count: 0, next_follow_at: new Date(Date.now() + FOLLOW_DAYS[0] * DAY).toISOString(), follow: null });
}

export async function approveSend(id, { cv = 'none', pdf } = {}) {
  const it = await getItem(id);
  return deliver(it, await cvAttachment(cv, pdf, id), cv);
}

/** Approved now, sent later: the PDF is rendered and stored now, cron sends it at the chosen time. */
export async function scheduleSend(id, { at, cv = 'none', pdf } = {}) {
  const when = Date.parse(at);
  if (!when || when < Date.now() + 60000) throw new Error('Pick a time in the future.');
  const it = await getItem(id);
  if (!it.email?.to?.includes('@')) throw new Error('Add a valid email address first.');
  if (cv === 'tailored' || cv === 'master') { if (!pdf) throw new Error('CV PDF missing - try again.'); await savePdf(`sched/${id}.pdf`, pdf); }
  else await cvAttachment(cv, null, id); // fail now, not at 9am, if the file is gone
  return updateItem(id, { status: 'scheduled', email: { ...it.email, sendAt: new Date(when).toISOString(), sendCv: cv, sendError: '' } });
}
export async function unschedule(id) {
  const it = await getItem(id);
  const { sendAt, sendCv, sendError, ...email } = it.email || {};
  return updateItem(id, { status: 'review', email });
}
/** Called by cron for scheduled emails that are due. */
export async function sendScheduled(id) {
  const it = await getItem(id);
  const cv = it.email?.sendCv || 'none';
  return deliver(it, await cvAttachment(cv, null, id), cv);
}

/**
 * Tailors the CV for this lead. The AI proposes a plan (what to lead with); cvguard rebuilds the CV from the
 * master so nothing is invented, dropped or lengthened, and it always stays one page.
 */
export async function tailorCv(id) {
  const { NAME, HEAD, P } = await who();
  const master = P.cv_data;
  if (!master?.sections?.length) throw new Error('Import your CV first (Settings > Profile) so there is something to tailor.');
  const it = await getItem(id);
  const ctx = await contextBlock();
  const plan = await llmJSON({ maxTokens: 6000, prompt: `Decide how to tailor ${NAME}'s CV for this specific lead. You only return a PLAN; the app rebuilds the CV from the master.

${ctx}

THE LEAD:
${(it.source_text || it.raw_text || '').slice(0, 9000)}
WHAT IT IS: ${it.info?.company || ''} - ${it.info?.role || ''} (${it.kind || ''})
SUGGESTED TWEAKS: ${(it.cv_tweaks || []).join(' | ')}

MASTER CV OUTLINE (sections [n], entries (n.n), bullets <n.n.n>):
${cvOutline(master)}
SPIKES (header line, pick 3-5 in the order that suits this lead): ${JSON.stringify(master.spikes || [])}

What to do:
- Put the most relevant sections, entries and bullets FIRST for this lead. Lead with whatever matches the lead: for a finance lead, finance experience; for a product lead, product work; for an operations lead, operations results.
- You MAY reword a bullet to use the lead's language. A reworded bullet must be NO LONGER than the original (count the chars shown), keep every number exactly as is, add no new fact, and keep **bold** markers balanced. Reword only where it clearly helps; most bullets stay as they are.
- Never remove anything. EDUCATION stays first.
Return JSON only:
{"sectionOrder": [all section indices, permutation],
 "entryOrder": {"<section index>": [all entry indices of that section, permutation]},
 "bulletOrder": {"<section.entry>": [all bullet indices of that entry, permutation]},
 "rewrites": {"<section.entry.bullet>": "new text"},
 "spikes": ["exact spike text", "..."],
 "changes": ["short, plain description of each change for this role"]}
Include only the sections/entries you actually reorder.` });
  const { cv, changes } = buildTailored(plan, master);
  return updateItem(id, { cv, cv_changes: changes });
}

/* ---------------- 5. Follow-ups: drafted automatically, sent on approval ---------------- */

export async function draftFollow(id) {
  const { NAME, HEAD, P } = await who();
  const it = await getItem(id);
  const n = (it.follow_count || 0) + 1, last = n >= FOLLOW_DAYS.length;
  const thread = it.thread_id ? threadToText(await getThread(it.thread_id)) : `Subject: ${it.email.subject}\n${it.email.body}`;
  const ctx = await contextBlock();
  const w = await llmJSON({ prompt: `You are ${NAME}.\n\n${ctx}\n\nCONVERSATION SO FAR (no reply yet):\n${thread}\n\nWrite follow-up #${n}. 40-80 words. No guilt, no "just checking in", no "bumping this". Add one small new thing - a relevant idea about their business, a recent result, or a sharper ask. Do not repeat anything already said. ${last ? 'This is the final follow-up: make it easy to say no or point to someone else.' : ''} Hyphens, never em dashes. Do not write a sign-off or signature - the app adds it.\nReturn JSON: {"subject": "Re: ${it.email.subject}", "body": ""}` });
  return updateItem(id, { follow: { subject: w.subject || 'Re: ' + it.email.subject, body: w.body || '', aiBody: w.body || '' } });
}

export async function sendFollow(id) {
  const it = await getItem(id);
  if (!it.follow?.body) throw new Error('No follow-up drafted yet.');
  const sig = pickSig(await prefs(), it.email.sig);
  const s = await sendMail({ to: it.email.to, subject: it.follow.subject, body: withSig(it.follow.body, sig), threadId: it.thread_id, inReplyTo: it.last_msg_id });
  await recordStyle('followup', it.follow.aiBody, it.follow.body);
  const n = (it.follow_count || 0) + 1;
  return updateItem(id, { follow_count: n, last_msg_id: s.messageId, follow: null, next_follow_at: n < FOLLOW_DAYS.length ? new Date(Date.now() + FOLLOW_DAYS[n] * DAY).toISOString() : null });
}

/* ---------------- 6. Replies ---------------- */

const STATUS_FOR = { interview: 'interview', rejection: 'closed', out_of_office: 'sent', bounce: 'review' };

export async function handleReply(id, convoText, latest) {
  const { NAME, HEAD, P } = await who();
  const it = await getItem(id);
  const ctx = await contextBlock();
  const r = await llmJSON({ prompt: `You are ${NAME}, in an email conversation about ${it.info?.role || 'an opportunity'} at ${it.info?.company || 'a company'}.\n\n${ctx}\n\nFULL CONVERSATION (oldest first):\n${convoText}\n\nClassify the latest message from the other side and draft ${NAME}'s response: 40-120 words, consistent with everything already said, answer every question they asked, move to a concrete next step. If scheduling, offer [slot 1], [slot 2], [slot 3]. If a rejection, a gracious 2-3 line note keeping the door open. Out of office or bounce: body "".\n${RULES}\nReturn JSON: {"category": "interview|positive|needs_info|rejection|out_of_office|bounce|other", "summary": "one line", "todo": "what ${NAME} must fill in or decide before sending, or empty", "subject": "Re: ...", "body": ""}` });
  const status = STATUS_FOR[r.category] || 'replied';
  const patch = { status, reply: { ...latest, category: r.category, summary: r.summary || '', todo: r.todo || '', subject: r.subject || 'Re: ' + it.email.subject, body: r.body || '', aiBody: r.body || '' } };
  if (r.category !== 'out_of_office') { patch.next_follow_at = null; patch.follow = null; }
  if (r.category === 'bounce') { patch.thread_id = null; patch.info = { ...it.info, missing: ['Email bounced - find the correct address'] }; }
  return { item: await updateItem(id, patch), r };
}

export async function sendReply(id) {
  const it = await getItem(id);
  const rep = it.reply || {};
  const to = (String(rep.replyTo || rep.from || '').match(/<([^>]+)>/) || [])[1] || rep.replyTo || rep.from || it.email.to;
  const sig = pickSig(await prefs(), it.email.sig);
  const s = await sendMail({ to, subject: rep.subject, body: withSig(rep.body, sig), threadId: it.thread_id, inReplyTo: rep.messageId || it.last_msg_id });
  await recordStyle('reply', rep.aiBody, rep.body);
  return updateItem(id, { last_msg_id: s.messageId, reply: { ...rep, sentAt: Date.now(), body: '' } });
}

/** A reply that came on LinkedIn/WhatsApp - pasted in by the user. */
export async function logReply(id, text) {
  const { NAME, HEAD, P } = await who();
  const it = await getItem(id);
  let convo = `--- ${NAME.toUpperCase()}\nSubject: ${it.email.subject}\n${it.email.body}`;
  if (it.thread_id) { try { convo = threadToText(await getThread(it.thread_id)); } catch (e) {} }
  convo += `\n\n--- THEM (via another channel), ${today()}\n${text}`;
  return (await handleReply(id, convo, { at: Date.now(), text, from: '', messageId: '' })).item;
}

/** Called by cron: new messages in the thread? */
export async function checkThread(it) {
  const msgs = await getThread(it.thread_id);
  const since = Math.max(Date.parse(it.sent_at) || 0, it.reply?.at || 0);
  const incoming = msgs.filter(m => !m.isMe && m.at > since);
  if (!incoming.length) return null;
  const m = incoming[incoming.length - 1];
  return handleReply(it.id, threadToText(msgs), { at: m.at, from: m.from, replyTo: m.replyTo, messageId: m.messageId, text: m.text });
}
