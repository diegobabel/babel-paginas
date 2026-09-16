import { randomUUID } from 'node:crypto';
import { supabase, configurado, iso, lerTudo } from './_supabase.js';

// Chave usada pelo Babel-OS para ler as respostas (GET). O formulário público só grava (POST).
// Configure CHAVE_LEITURA nas env vars do projeto na Vercel.
const CHAVE_LEITURA = process.env.CHAVE_LEITURA;

const CAMPOS = ['referrerName','referrerCode','leadName','leadWhatsapp','company','niche',
  'need','leadEmail','bestTime','preferredDate'];

// camelCase na borda (contrato do Babel-OS) <-> snake_case na tabela.
const COLUNA = {
  referrerName:'referrer_name', referrerCode:'referrer_code', leadName:'lead_name',
  leadWhatsapp:'lead_whatsapp', company:'company', niche:'niche', need:'need',
  leadEmail:'lead_email', bestTime:'best_time', preferredDate:'preferred_date'
};

function limpar(v, max){ return String(v == null ? '' : v).trim().slice(0, max); }

async function lerCorpo(req){
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  const partes = [];
  for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { return null; }
}

function paraJson(r){
  const o = { id: r.id };
  for (const c of CAMPOS) o[c] = r[COLUNA[c]];
  o.status = r.status;
  o.origem = r.origem;
  o.createdAt = iso(r.created_at);
  return o;
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (!configurado) {
    return res.status(503).json({ ok:false, erro:'armazenamento-nao-configurado' });
  }

  if (req.method === 'POST') {
    const b = await lerCorpo(req);
    if (!b || typeof b !== 'object') return res.status(400).json({ ok:false, erro:'corpo-invalido' });
    if (b.website) return res.status(200).json({ ok:true }); // honeypot anti-robô
    const r = {};
    for (const c of CAMPOS) r[COLUNA[c]] = limpar(b[c], c === 'need' ? 2000 : 200);
    r.referrer_code = r.referrer_code.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
    if (!r.lead_name || !r.lead_whatsapp) return res.status(400).json({ ok:false, erro:'campos-obrigatorios' });
    r.id = randomUUID();
    r.status = 'novo';
    r.origem = 'pagina';

    const { error } = await supabase().from('indicacoes').insert(r);
    if (error) {
      console.error('indicacoes: falha ao gravar', error);
      return res.status(500).json({ ok:false, erro:'falha-ao-gravar' });
    }
    return res.status(200).json({ ok:true });
  }

  if (req.method === 'GET') {
    if (!CHAVE_LEITURA) return res.status(503).json({ ok:false, erro:'chave-nao-configurada' });
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.get('chave') !== CHAVE_LEITURA) return res.status(401).json({ ok:false, erro:'nao-autorizado' });
    try {
      const itens = (await lerTudo('indicacoes', url.searchParams.get('desde') || '')).map(paraJson);
      return res.status(200).json({ ok:true, total: itens.length, indicacoes: itens });
    } catch (e) {
      console.error('indicacoes: falha ao ler', e);
      return res.status(500).json({ ok:false, erro:'falha-ao-ler' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok:false, erro:'metodo' });
}
