import { createClient } from '@supabase/supabase-js';

// Cliente service role. Roda SÓ no servidor das funções da Vercel: essa chave
// ignora RLS por design, então ela nunca pode chegar ao navegador.
// As tabelas têm RLS ligada e nenhuma policy — anon/authenticated não enxergam nada.
const URL_SB = process.env.SUPABASE_URL;
const CHAVE_SB = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const BUCKET = 'comprovantes';
export const configurado = Boolean(URL_SB && CHAVE_SB);

let cliente;
export function supabase(){
  if (!cliente) {
    cliente = createClient(URL_SB, CHAVE_SB, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cliente;
}

// created_at volta do Postgres como "+00:00"; o Babel-OS sempre recebeu ISO com Z.
export function iso(v){
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString();
}

// PostgREST devolve no máximo 1000 linhas por requisição.
const PAGINA = 1000;
export async function lerTudo(tabela, desde){
  const linhas = [];
  for (let de = 0; ; de += PAGINA) {
    let q = supabase().from(tabela).select('*')
      .order('created_at', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (desde) q = q.gt('created_at', desde);
    const { data, error } = await q;
    if (error) throw error;
    linhas.push(...data);
    if (data.length < PAGINA) break;
  }
  return linhas;
}
