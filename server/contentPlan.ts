import { createHash } from 'node:crypto';
export type ApprovedPanel = {
  id: string; sha256: string; canonVersion: string; approved: boolean;
  imageUrl: string; page: number; panel: number; caption: string;
  characters: string[]; props: string[];
};
// Pure planning: never spends money, changes canon, or publishes content.
export function planShort(panels: ApprovedPanel[], canonVersion: string) {
  if (!canonVersion || !panels.length || panels.length > 6) throw new Error('Select 1–6 approved panels and a canon version.');
  const seen = new Set<string>();
  let previous = -1;
  const shots = panels.map((p) => {
    if (!p.approved || p.canonVersion !== canonVersion || !/^[a-f0-9]{64}$/.test(p.sha256)) throw new Error('Unapproved or stale source panel.');
    if (!Number.isInteger(p.page) || p.page < 1 || !Number.isInteger(p.panel) || p.panel < 1 || p.panel > 99) throw new Error('Invalid page/panel address.');
    const order = p.page * 100 + p.panel;
    if (seen.has(p.id) || order <= previous) throw new Error('Duplicate or out-of-order panel.');
    if (new URL(p.imageUrl).protocol !== 'https:') throw new Error('Use an approved HTTPS asset URL.');
    seen.add(p.id); previous = order;
    return { sourceId: p.id, sourceHash: p.sha256, imageUrl: p.imageUrl, seconds: 5,
      caption: p.caption, characters: [...p.characters], props: [...p.props],
      motion: 'subtle camera move; preserve faces, limbs, wardrobe and weapon geometry',
      status: 'planned' as const };
  });
  const specification = { canonVersion, format: '9:16', width: 1080, height: 1920, shots };
  return { ...specification, idempotencyKey: createHash('sha256').update(JSON.stringify(specification)).digest('hex'),
    status: 'planned', publicationAllowed: false,
    gates: ['verify source bytes against hash', 'reserve budget', 'generate motion', 'technical QC', 'visual continuity review', 'letter exact captions', 'review final cut', 'authorize distribution'] };
}
