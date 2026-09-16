import { randomUUID } from 'node:crypto';
import { supabase, configurado, iso, lerTudo, BUCKET } from './_supabase.js';

// Configure CHAVE_LEITURA nas env vars do projeto na Vercel.
const CHAVE_LEITURA = process.env.CHAVE_LEITURA;
const PLANOS = ['vip', 'profissional', 'basico'];
const TIPOS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_ARQUIVO = 3 * 1024 * 1024; // igual ao file_size_limit do bucket

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

function paraJson(r){
  return {
    id: r.id,
    vendedorNome: r.vendedor_nome,
    vendedorCodigo: r.vendedor_codigo,
    dataVenda: r.data_venda,
    setup: Number(r.setup),
    plano: r.plano,
    clienteNome: r.cliente_nome,
    empresa: r.empresa,
    nicho: r.nicho,
    whatsapp: r.whatsapp,
    email: r.email,
    comprovante: {
      path: r.comprovante_path,
      url: '/api/comprovante?path=' + encodeURIComponent(r.comprovante_path),
      nome: r.comprovante_nome,
      tipo: r.comprovante_tipo
    },
    status: r.status,
    origem: r.origem,
    createdAt: iso(r.created_at)
  };
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (!configurado) {
    return res.status(503).json({ ok:false, erro:'armazenamento-nao-configurado' });
  }

  if (req.method === 'POST') {
    const b = await lerCorpo(req);
    if (!b || typeof b !== 'object') return res.status(400).json({ ok:false, erro:'corpo-invalido' });
    if (b.website) return res.status(200).json({ ok:true });
    const v = {
      vendedor_nome: limpar(b.vendedorNome, 120),
      vendedor_codigo: limpar(b.vendedorCodigo, 40).toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      data_venda: dataValida(limpar(b.dataVenda, 10)),
      setup: Math.max(0, Math.round(Number(b.setup) * 100) / 100 || 0),
      plano: PLANOS.includes(b.plano) ? b.plano : '',
      cliente_nome: limpar(b.clienteNome, 120),
      empresa: limpar(b.empresa, 160),
      nicho: limpar(b.nicho, 120),
      whatsapp: limpar(b.whatsapp, 20),
      email: limpar(b.email, 160)
    };
    if (!v.vendedor_nome || !v.data_venda || !v.plano || !v.cliente_nome || !v.empresa || !v.whatsapp || !v.email) {
      return res.status(400).json({ ok:false, erro:'campos-obrigatorios' });
    }

    const arq = b.comprovante;
    if (!arq || !TIPOS[arq.tipo] || typeof arq.base64 !== 'string') {
      return res.status(400).json({ ok:false, erro:'comprovante' });
    }
    const bytes = Buffer.from(arq.base64, 'base64');
    if (!bytes.length || bytes.length > MAX_ARQUIVO) return res.status(400).json({ ok:false, erro:'comprovante-tamanho' });

    const id = randomUUID();
    const caminho = id + '.' + TIPOS[arq.tipo];
    // Comprovante é documento financeiro: bucket privado, servido só via /api/comprovante com chave.
    const { error: erroUp } = await supabase().storage.from(BUCKET)
      .upload(caminho, bytes, { contentType: arq.tipo, upsert: false });
    if (erroUp) {
      console.error('vendas: falha ao subir comprovante', erroUp);
      return res.status(500).json({ ok:false, erro:'falha-ao-gravar' });
    }

    v.id = id;
    v.comprovante_path = caminho;
    v.comprovante_nome = limpar(arq.nome, 120) || ('comprovante.' + TIPOS[arq.tipo]);
    v.comprovante_tipo = arq.tipo;
    v.status = 'pendente';
    v.origem = 'pagina';

    const { error } = await supabase().from('vendas').insert(v);
    if (error) {
      // Sem a linha o arquivo fica órfão e inalcançável: desfaz o upload.
      await supabase().storage.from(BUCKET).remove([caminho]).catch(() => {});
      console.error('vendas: falha ao gravar', error);
      return res.status(500).json({ ok:false, erro:'falha-ao-gravar' });
    }
    return res.status(200).json({ ok:true });
  }

  if (req.method === 'GET') {
    if (!CHAVE_LEITURA) return res.status(503).json({ ok:false, erro:'chave-nao-configurada' });
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.get('chave') !== CHAVE_LEITURA) return res.status(401).json({ ok:false, erro:'nao-autorizado' });
    try {
      const itens = (await lerTudo('vendas', url.searchParams.get('desde') || '')).map(paraJson);
      return res.status(200).json({ ok:true, total: itens.length, vendas: itens });
    } catch (e) {
      console.error('vendas: falha ao ler', e);
      return res.status(500).json({ ok:false, erro:'falha-ao-ler' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok:false, erro:'metodo' });
}
