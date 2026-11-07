// Predlog kategorije na osnovu naziva mesta/napomene.
// 1) Istorija: gde je isto mesto ranije uneto (uči iz vaših izbora).
// 2) Ključne reči: poznati lanci i tipovi objekata u Srbiji.
import * as S from './store.js';

const norm = (s) =>
  String(s || '').toLowerCase()
    .replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim();

const RULES = [
  { cat: 'izlasci', why: 'restoran / kafić', words: ['smokvica', 'restoran', 'kafana', 'kafe', 'caffe', 'cafe', 'coffee', 'bar', 'pub', 'pivnica', 'bistro', 'picerija', 'pizza', 'pizzeria', 'burger', 'grill', 'rostilj', 'sushi', 'splav', 'klub', 'club', 'starbucks', 'mcdonald', 'kfc', 'wolt', 'glovo', 'donesi', 'bioskop', 'cineplexx', 'tavern', 'trattoria', 'brunch', 'bakery bar'] },
  { cat: 'hrana', why: 'prodavnica / market', words: ['maxi', 'idea', 'lidl', 'aman', 'univerexport', 'tempo', 'dis', 'roda', 'mercator', 'pijaca', 'pekara', 'mesara', 'market', 'prodavnica', 'shop&go', 'shopngo', 'gomex', 'metro', 'ribarnica', 'mlekara'] },
  { cat: 'auto', why: 'gorivo / auto', words: ['nis', 'petrol', 'gazprom', 'mol', 'omv', 'lukoil', 'eko', 'pumpa', 'gorivo', 'benzin', 'dizel', 'parking', 'putarina', 'servis', 'vulkanizer', 'perionica', 'registracija', 'tehnicki'] },
  { cat: 'zdravlje', why: 'zdravlje / sport', words: ['apoteka', 'benu', 'teretana', 'gym', 'fitness', 'doktor', 'lekar', 'stomatolog', 'zubar', 'laboratorija', 'klinika', 'poliklinika', 'suplement', 'protein', 'bazen'] },
  { cat: 'odeca', why: 'odeća / nega', words: ['zara', 'h&m', 'hm', 'reserved', 'nike', 'adidas', 'decathlon', 'lilly', 'dm', 'frizer', 'berberin', 'kozmetika', 'sephora', 'obuca', 'bershka', 'pull&bear', 'lcwaikiki'] },
  { cat: 'dom', why: 'kuća / domaćinstvo', words: ['ikea', 'jysk', 'emmezeta', 'bauhaus', 'uradi sam', 'home centar', 'tehnomanija', 'gigatron', 'tehnomedia', 'win win', 'pepco', 'jumbo'] },
  { cat: 'racuni', why: 'račun', words: ['eps', 'infostan', 'sbb', 'mts', 'a1', 'yettel', 'telekom', 'struja', 'voda', 'grejanje'] },
  { cat: 'pokloni', why: 'poklon', words: ['poklon', 'cvece', 'cvecara', 'rodjendan'] },
];

// Vraća { categoryId, reason } ili null. Predlaže samo aktivne kategorije zadate vrste.
export function suggestCategory(text, kind = 'expense') {
  const q = norm(text);
  if (q.length < 3) return null;
  const active = new Set(S.categoriesOf(kind).map((c) => c.id));

  // 1) Istorija — najčešća kategorija za isti početak napomene.
  const key = q.split(' ').slice(0, 2).join(' ');
  const counts = {};
  for (const t of S.getState().transactions) {
    if (t.kind !== kind || !t.note) continue;
    const n = norm(t.note);
    if (n.startsWith(key) || key.startsWith(n.split(' ').slice(0, 2).join(' '))) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
  }
  const best = Object.entries(counts).filter(([c]) => active.has(c)).sort((a, b) => b[1] - a[1])[0];
  if (best) return { categoryId: best[0], reason: `ranije uneto ${best[1]}× ovde` };

  // 2) Ključne reči.
  if (kind !== 'expense') return null;
  const tokens = q.split(' ');
  for (const r of RULES) {
    if (!active.has(r.cat)) continue;
    const hit = r.words.find((w) => (w.includes(' ') ? q.includes(w) : tokens.some((t) => t === w || (w.length >= 4 && t.startsWith(w)))));
    if (hit) return { categoryId: r.cat, reason: `prepoznato kao ${r.why}` };
  }
  return null;
}
