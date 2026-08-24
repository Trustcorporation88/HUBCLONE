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

## Banco (produção) — Postgres do Supabase

`DATABASE_URL` deve apontar para o Postgres do Supabase — nunca `file:./dev.db`
em produção.

Em *Project Settings → Database → Connection string*, copie a URL do **pooler
(Supavisor)**, não a do host direto:

| Host | Quando usar |
|------|-------------|
| `aws-0-<region>.pooler.supabase.com:5432` (session) | **É o que usamos.** Compatível com o Prisma, inclusive `prisma db push`. Não acrescente `?pgbouncer=true`. |
| `aws-0-<region>.pooler.supabase.com:6543` (transaction) | Só em runtime serverless. Exige `?pgbouncer=true&connection_limit=1` e um `DIRECT_URL` na 5432 para migrations. |
| `db.<ref>.supabase.co:5432` (direto) | **Evite.** Só resolve em IPv6; falha no Railway, que roda com egresso IPv4. |

### Schema

O projeto não usa `prisma migrate` — o schema é aplicado com `prisma db push`.
Rode como passo explícito de release, **nunca no boot do container**:

```bash
npm run db:deploy   # prisma db push --skip-generate
```

O `npm start` só sobe o Next. Um `db push` a cada boot é lento e, sob qualquer
drift do schema, arrisca uma alteração destrutiva sem revisão.

### Arquivos

Comprovantes de pagamento, guias, XMLs capturados e uploads do Inbox são
gravados em **disco local** (`/data/...`). No Railway o disco é efêmero: esses
arquivos se perdem no redeploy. Se precisar de persistência, anexe um volume ao
service ou migre para um object store — o código hoje **não** fala com o
Supabase Storage.

Certificados A1 (.pfx/PEM) são a exceção: ficam **cifrados no banco**
(AES-256-GCM, via `CERT_ENCRYPTION_KEY`), não em disco.

## Segredos

- `AUTH_SECRET` — assina a sessão (JWT).
- `CERT_ENCRYPTION_KEY` — cifra dados sensíveis em repouso (certificados A1,
  credenciais de integração). Deve ser **diferente** do `AUTH_SECRET`. Se
  ausente, o payload cai no esquema legado v1 derivado do `AUTH_SECRET`.
  Ao trocar a chave, rode `npm run certs:rekey` **antes** — senão o material
  já cifrado fica ilegível.
- `BOOTSTRAP_TOKEN` — exigido em `/setup`; sem ele qualquer visitante pode
  criar o primeiro escritório.

## Serviços (escritório + portal)

- Fila por setor, P&L horas, SLA, contratos/OS, inbox IA, saúde fiscal, advisory, marketplace

## Setup

```bash
cp .env.example .env   # DATABASE_URL + AUTH_SECRET + CERT_ENCRYPTION_KEY + BOOTSTRAP_TOKEN + SMTP_* + OPENAI_API_KEY
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
