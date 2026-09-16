import { get } from '@vercel/blob';

// Serve os comprovantes, que são gravados como privados no Blob.
// Só responde com a CHAVE_LEITURA — a mesma usada pelo Babel-OS nos GETs de /api/vendas.
const CHAVE_LEITURA = process.env.CHAVE_LEITURA;
const PREFIXO = 'comprovantes/';

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ ok:false, erro:'armazenamento-nao-configurado' });
  }
  if (!CHAVE_LEITURA) return res.status(503).json({ ok:false, erro:'chave-nao-configurada' });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false, erro:'metodo' });
  }

  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('chave') !== CHAVE_LEITURA) {
    return res.status(401).json({ ok:false, erro:'nao-autorizado' });
  }

  const path = url.searchParams.get('path') || '';
  if (!path.startsWith(PREFIXO) || path.includes('..')) {
    return res.status(400).json({ ok:false, erro:'caminho-invalido' });
  }

  const r = await get(path, { access:'private', useCache:false });
  if (!r) return res.status(404).json({ ok:false, erro:'nao-encontrado' });

  const bytes = Buffer.from(await new Response(r.stream).arrayBuffer());
  res.setHeader('Content-Type', r.blob?.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', String(bytes.length));
  return res.status(200).send(bytes);
}
