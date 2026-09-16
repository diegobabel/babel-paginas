import { put, list, get } from '@vercel/blob';

// Configure CHAVE_LEITURA nas env vars do projeto na Vercel.
const CHAVE_LEITURA = process.env.CHAVE_LEITURA;
const PREFIXO = 'vendas/';
const PLANOS = ['vip', 'profissional', 'basico'];
const TIPOS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_ARQUIVO = 3 * 1024 * 1024;

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

function limpar(v, max){ return String(v == null ? '' : v).trim().slice(0, max); }

async function lerCorpo(req){
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  const partes = [];
  for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { return null; }
}

function dataValida(t){
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t || '');
  if (!m) return '';
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (d.getUTCDate() !== +m[1] || d.getUTCMonth() !== +m[2] - 1) return '';
  return m[3] + '-' + m[2] + '-' + m[1];
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ ok:false, erro:'armazenamento-nao-configurado' });
  }

  if (req.method === 'POST') {
    const b = await lerCorpo(req);
    if (!b || typeof b !== 'object') return res.status(400).json({ ok:false, erro:'corpo-invalido' });
    if (b.website) return res.status(200).json({ ok:true });
    const v = {
      vendedorNome: limpar(b.vendedorNome, 120),
      vendedorCodigo: limpar(b.vendedorCodigo, 40).toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      dataVenda: dataValida(limpar(b.dataVenda, 10)),
      setup: Math.max(0, Math.round(Number(b.setup) * 100) / 100 || 0),
      plano: PLANOS.includes(b.plano) ? b.plano : '',
      clienteNome: limpar(b.clienteNome, 120),
      empresa: limpar(b.empresa, 160),
      nicho: limpar(b.nicho, 120),
      whatsapp: limpar(b.whatsapp, 20),
      email: limpar(b.email, 160)
    };
    if (!v.vendedorNome || !v.dataVenda || !v.plano || !v.clienteNome || !v.empresa || !v.whatsapp || !v.email) {
      return res.status(400).json({ ok:false, erro:'campos-obrigatorios' });
    }
    const agora = new Date();
    const id = agora.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const arq = b.comprovante;
    if (!arq || !TIPOS[arq.tipo] || typeof arq.base64 !== 'string') {
      return res.status(400).json({ ok:false, erro:'comprovante' });
    }
    const bytes = Buffer.from(arq.base64, 'base64');
    if (!bytes.length || bytes.length > MAX_ARQUIVO) return res.status(400).json({ ok:false, erro:'comprovante-tamanho' });
    // Comprovante é documento financeiro: gravado como privado e servido só via /api/comprovante com chave.
    const up = await put('comprovantes/' + id + '.' + TIPOS[arq.tipo], bytes, {
      access: 'private', contentType: arq.tipo, addRandomSuffix: true
    });
    v.comprovante = {
      path: up.pathname,
      url: '/api/comprovante?path=' + encodeURIComponent(up.pathname),
      nome: limpar(arq.nome, 120) || ('comprovante.' + TIPOS[arq.tipo]),
      tipo: arq.tipo
    };
    v.id = 'vv-' + id;
    v.status = 'pendente';
    v.origem = 'pagina';
    v.createdAt = agora.toISOString();
    await put(PREFIXO + id + '.json', JSON.stringify(v), {
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
    const alvo = blobs.filter(x => !desde || new Date(x.uploadedAt).toISOString() > desde);
    const itens = [];
    for (let i = 0; i < alvo.length; i += 10) {
      const lote = await Promise.all(alvo.slice(i, i + 10).map(async x => {
        try {
          const r = await get(x.pathname, { access:'private', useCache:false });
          return r ? await new Response(r.stream).json() : null;
        } catch { return null; }
      }));
      itens.push(...lote.filter(Boolean));
    }
    itens.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return res.status(200).json({ ok:true, total: itens.length, vendas: itens });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok:false, erro:'metodo' });
}
