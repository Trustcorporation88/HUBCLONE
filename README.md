# ProContador OS

Sistema para escritórios de contabilidade — practice management + fiscal nativo + execução financeira num único fluxo:

`captura → audita → apura → guia → paga → prova → fecha tarefa → notifica cliente`

## Produção — zero mock

Nenhum caminho inventa SEFAZ, PIX, boleto ou e-mail.

| Área | Comportamento |
|------|----------------|
| Captura XML | Só live com certificado A1; sem cert = erro |
| Auditoria XML | Achados bloqueantes impedem avançar o Autopilot |
| E-mail | SMTP obrigatório (`SMTP_*`) |
| WhatsApp | Manual (download + `wa.me`) + SLA monitorado |
| Pagamento | Só `barcode` / `pixPayload` oficiais + comprovante |
| Inbox | OpenAI real (`OPENAI_API_KEY` ou Integrações) |
| Integrações | Domínio/Omie/ClickSign só com credencial testada |
| Auth | `/setup` cria o 1º escritório real; login com slug |

## Banco (produção) — Supabase PRO

Use **PostgreSQL do Supabase PRO**. Em *Project Settings → Database → Connection string*
copie a URL e coloque em `DATABASE_URL` (porta 5432 direta para migrations; use o
pooler na 6543 com `?pgbouncer=true` em ambientes serverless).

`DATABASE_URL` deve apontar para o Postgres do Supabase — nunca `file:./dev.db` em produção.

## Arquivos — Supabase Storage PRO

Comprovantes de pagamento, guias e XMLs capturados são persistidos no **Supabase Storage**
(não mais no disco local efêmero). Configure:

- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API; a service role
  key é server-only, nunca exponha no client).
- `SUPABASE_STORAGE_BUCKET` (default `hub-files`) — crie um bucket **privado** com esse nome.

Certificados A1 (.pfx/PEM) continuam **cifrados no banco** (AES-256-GCM), não no bucket.

## Segredos

- `AUTH_SECRET` — assina a sessão (JWT).
- `ENCRYPTION_KEY` — cifra dados sensíveis em repouso (certificados, credenciais de
  integração). Deve ser **diferente** do `AUTH_SECRET`; se ausente, cai para `AUTH_SECRET`
  por compatibilidade com dados já cifrados.

## Serviços (escritório + portal)

- Fila por setor, P&L horas, SLA, contratos/OS, inbox IA, saúde fiscal, advisory, marketplace

## Setup

```bash
cp .env.example .env   # DATABASE_URL + AUTH_SECRET + ENCRYPTION_KEY + SUPABASE_* + SMTP_* + OPENAI_API_KEY
npm install
npm run db:setup
npm run dev
```

1. Abra [http://localhost:3000/setup](http://localhost:3000/setup) e crie o escritório
2. Entre em [/login](http://localhost:3000/login) com slug + e-mail + senha
3. Cadastre clientes, certificados A1 e guias reais

## Docs

- [PRODUCT.md](docs/PRODUCT.md)
- [BENCHMARK.md](docs/BENCHMARK.md)
- [ROADMAP.md](docs/ROADMAP.md)
