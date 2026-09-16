import { put, list, get } from '@vercel/blob';

// Chave usada pelo Babel-OS para ler as respostas (GET). O formulário público só grava (POST).
// Configure CHAVE_LEITURA nas env vars do projeto na Vercel.
const CHAVE_LEITURA = process.env.CHAVE_LEITURA;
const PREFIXO = 'indicacoes/';

const CAMPOS = ['referrerName','referrerCode','leadName','leadWhatsapp','company','niche',
  'need','leadEmail','bestTime','preferredDate'];

function limpar(v, max){ return String(v == null ? '' : v).trim().slice(0, max); }

async function lerCorpo(req){
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  const partes = [];
  for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { return null; }
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ ok:false, erro:'armazenamento-nao-configurado' });
  }

  if (req.method === 'POST') {
    const b = await lerCorpo(req);
    if (!b || typeof b !== 'object') return res.status(400).json({ ok:false, erro:'corpo-invalido' });
    if (b.website) return res.status(200).json({ ok:true }); // honeypot anti-robô
    const r = {};
    for (const c of CAMPOS) r[c] = limpar(b[c], c === 'need' ? 2000 : 200);
    r.referrerCode = r.referrerCode.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
    if (!r.leadName || !r.leadWhatsapp) return res.status(400).json({ ok:false, erro:'campos-obrigatorios' });
    const agora = new Date();
    r.createdAt = agora.toISOString();
    r.status = 'novo';
    r.origem = 'pagina';
    const id = agora.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    r.id = 'vc-' + id;
    await put(PREFIXO + id + '.json', JSON.stringify(r), {
      access: 'private', contentType: 'application/json', addRandomSuffix: true
    });
    return res.status(200).json({ ok:true });
  }

  if (req.method === 'GET') {
    if (!CHAVE_LEITURA) return res.status(503).json({ ok:false, erro:'chave-nao-configurada' });
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.get('chave') !== CHAVE_LEITURA) return res.status(401).json({ ok:false, erro:'nao-autorizado' });
    const desde = url.searchParams.get('desde') || '';
    const blobs = [];
    let cursor;
    do {
      const pg = await list({ prefix: PREFIXO, cursor, limit: 1000 });
      blobs.push(...pg.blobs);
      cursor = pg.hasMore ? pg.cursor : undefined;
    } while (cursor);
    const alvo = blobs.filter(b => !desde || new Date(b.uploadedAt).toISOString() > desde);
    const itens = [];
    for (let i = 0; i < alvo.length; i += 10) {
      const lote = await Promise.all(alvo.slice(i, i + 10).map(async b => {
        try {
          const r = await get(b.pathname, { access:'private', useCache:false });
          return r ? await new Response(r.stream).json() : null;
        } catch { return null; }
      }));
      itens.push(...lote.filter(Boolean));
    }
    itens.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return res.status(200).json({ ok:true, total: itens.length, indicacoes: itens });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok:false, erro:'metodo' });
}
