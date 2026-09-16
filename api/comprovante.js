import { supabase, configurado, BUCKET } from './_supabase.js';

// Serve os comprovantes, que ficam num bucket privado do Supabase Storage.
// Só responde com a CHAVE_LEITURA — a mesma usada pelo Babel-OS nos GETs de /api/vendas.
const CHAVE_LEITURA = process.env.CHAVE_LEITURA;

// O bucket já delimita o escopo; o path é só o nome do arquivo dentro dele.
const CAMINHO_OK = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (!configurado) {
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
  if (!CAMINHO_OK.test(path) || path.includes('..')) {
    return res.status(400).json({ ok:false, erro:'caminho-invalido' });
  }

  const { data, error } = await supabase().storage.from(BUCKET).download(path);
  if (error || !data) return res.status(404).json({ ok:false, erro:'nao-encontrado' });

  const bytes = Buffer.from(await data.arrayBuffer());
  res.setHeader('Content-Type', data.type || 'application/octet-stream');
  res.setHeader('Content-Length', String(bytes.length));
  return res.status(200).send(bytes);
}
