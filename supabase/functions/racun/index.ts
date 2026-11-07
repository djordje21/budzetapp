// Supabase Edge Function "racun": čita javnu stranicu za proveru fiskalnog računa
// (suf.purs.gov.rs) i vraća naziv i adresu prodajnog mesta. Browser to ne može sam zbog CORS-a.
// Poziv je dozvoljen samo prijavljenim korisnicima (Verify JWT uključen).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { url } = await req.json();
    const u = new URL(url);
    if (u.hostname !== 'suf.purs.gov.rs') return json({ error: 'Nije adresa fiskalnog računa' }, 400);

    const r = await fetch(u.toString(), { headers: { 'Accept-Language': 'sr-Latn-RS,sr;q=0.9' } });
    if (!r.ok) return json({ error: `Poreska uprava je vratila ${r.status}` }, 502);
    const html = await r.text();

    const label = (id: string) => {
      const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)<`, 'i'));
      return m ? decode(m[1]).replace(/\s+/g, ' ').trim() : '';
    };
    const journal = decode((html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i) || [])[1] || '');

    // Rezerva: zaglavlje žurnala — PIB, preduzeće, prodajno mesto, adresa, grad.
    const head = journal.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const start = head.findIndex((l) => /ФИСКАЛНИ РАЧУН|FISKALNI RAČUN/i.test(l));
    const after = start >= 0 ? head.slice(start + 1, start + 7) : [];
    const pibIdx = after.findIndex((l) => /^\d{9}$/.test(l));
    const hdr = pibIdx >= 0 ? after.slice(pibIdx + 1) : after;

    return json({
      shop: label('shopFullNameLabel') || hdr[1] || hdr[0] || '',
      company: hdr[0] || '',
      address: label('addressLabel') || hdr[2] || '',
      city: label('cityLabel') || hdr[3] || '',
      total: label('totalAmountLabel'),
      datetime: label('sdcDateTimeLabel'),
      invoice: label('invoiceNumberLabel'),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
