# Migração Blob → Supabase

## Decisão de arquitetura
O Babel-OS continua lendo por `GET /api/*` com `CHAVE_LEITURA`. A service role key
**nunca sai do servidor** das funções da Vercel, e o Babel-OS não muda uma linha.

```
Babel-OS  --GET ?chave=...-->  Vercel Function  --service role-->  Supabase
```

As alternativas foram descartadas: leitura direta exigiria a service role key no
Babel-OS (expõe o banco inteiro se ele roda no navegador), e anon + RLS exigiria
Supabase Auth com login de verdade.

## Estado atual
| | Antes | Agora |
|---|---|---|
| Dados | JSON no Vercel Blob | tabelas Postgres (`indicacoes`, `vendas`) |
| Comprovantes | Blob privado | Supabase Storage, bucket privado `comprovantes` |
| `GET /api/*` | chave no query string | **igual** (chave no query string) |
| `api/comprovante.js` | proxy autenticado no Blob | proxy autenticado no Storage |
| Env vars | `BLOB_READ_WRITE_TOKEN`, `CHAVE_LEITURA` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CHAVE_LEITURA` |

O contrato JSON das respostas foi preservado (camelCase, `createdAt` em ISO com `Z`,
`comprovante.url` apontando para `/api/comprovante`). Única mudança: `id` agora é
um UUID, sem os prefixos `vc-` / `vv-`.

## Feito
- [x] MCP do Supabase aprovado (project_ref `lorseccikipnkmierarn`)
- [x] `supabase/schema.sql` aplicado — tabelas, índices, RLS ligada **sem policy**
      (sem policy, anon/authenticated não enxergam nada; service role ignora RLS por design)
- [x] Bucket privado `comprovantes` criado (3 MB, PDF/JPEG/PNG/WebP)
- [x] `api/_supabase.js` — cliente service role compartilhado + paginação do PostgREST
- [x] `api/indicacoes.js`, `api/vendas.js`, `api/comprovante.js` reescritos
- [x] `SUPABASE_URL` e `CHAVE_LEITURA` configuradas nos 3 ambientes da Vercel

## Falta
1. `SUPABASE_SERVICE_ROLE_KEY` nas env vars da Vercel (segredo — pegar no dashboard)
2. Deploy + testar os dois formulários de verdade
3. **Só depois de validado:** apagar o Blob store, remover `@vercel/blob` do
   `package.json` e a env var `BLOB_READ_WRITE_TOKEN`

## Notas
- O Blob store estava vazio (0 arquivos nos 3 prefixos), então não houve dados a migrar.
- O advisor de segurança aponta `rls_enabled_no_policy` nas duas tabelas: é intencional.
- O advisor também aponta `public.rls_auto_enable()` como `SECURITY DEFINER` chamável
  por `anon`. É uma guardrail do próprio Supabase (`RETURNS event_trigger`, liga RLS
  em tabelas novas), não é invocável via RPC fora de um event trigger. Não mexer.

## Projeto Vercel
`babel-paginas` — prj_esuiZ3ldjB4gQ5rxW9TYI094Q3QF (team_Zg1D3IIdhWfp8kOFM3GgRXBt)
