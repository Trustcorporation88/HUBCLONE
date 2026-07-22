# HUB Contábil OS

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

`ALLOW_DEMO=false` em produção. Health: `GET /api/health`

## Serviços (escritório + portal)

- Fila por setor, P&L horas, SLA, contratos/OS, inbox IA, saúde fiscal, advisory, marketplace

## Setup

```bash
cp .env.example .env   # AUTH_SECRET + SMTP_* + OPENAI_API_KEY
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
