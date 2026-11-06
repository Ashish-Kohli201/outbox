import { getItem, updateItem, children } from '@/lib/db';
import { json, wrap } from '@/lib/http';
import { researchCompany } from '@/lib/research';
import { processItem, rewrite, approveSend, scheduleSend, unschedule, sendScheduled, tailorCv, draftFollow, sendFollow, sendReply, logReply, draftForPeople } from '@/lib/pipeline';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = wrap(async (req, { params }) => {
  const { action, ...a } = await req.json();
  const { id } = await params;
  let item;
  switch (action) {
    case 'process': item = await processItem(id, { auto: !!a.auto }); break;
    case 'rewrite': item = await rewrite(id, a.instruction); break;
    case 'approve': item = await approveSend(id, { cv: a.cv, pdf: a.pdf }); break;
    case 'schedule': item = await scheduleSend(id, { at: a.at, cv: a.cv, pdf: a.pdf }); break;
    case 'sendNow': item = await sendScheduled(id); break;
    case 'unschedule': item = await unschedule(id); break;
    case 'research': {
      const it0 = await getItem(id);
      const r = await researchCompany(a.company || it0.info?.company, it0.info?.role || '');
      if (!r) return json({ error: 'Could not find anything online for that name.' }, 404);
      item = await updateItem(id, { info: { ...it0.info, company: a.company || it0.info?.company || '', research: r } });
      break;
    }
    case 'tailorCv': item = await tailorCv(id); break;
    case 'resetCv': item = await updateItem(id, { cv: null, cv_changes: [] }); break;
    case 'applied': item = await updateItem(id, { status: 'sent', sent_at: new Date().toISOString(), next_follow_at: null }); break;
    case 'status': item = await updateItem(id, { status: a.status, ...(a.status === 'closed' || a.status === 'skipped' ? { next_follow_at: null, follow: null } : {}) }); break;
    case 'draftFollow': item = await draftFollow(id); break;
    case 'sendFollow': item = await sendFollow(id); break;
    case 'sendReply': item = await sendReply(id); break;
    case 'logReply': item = await logReply(id, a.text || ''); break;
    case 'people': await draftForPeople(id, a.people || []); item = await getItem(id); break;
    default: return json({ error: 'Unknown action' }, 400);
  }
  return json({ item, children: await children(id) });
});
