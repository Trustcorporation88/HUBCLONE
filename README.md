# HUB Contábil OS

Sistema para escritórios de contabilidade — practice management + fiscal nativo + execução financeira num único fluxo:

`captura → audita → apura → guia → paga → prova → fecha tarefa → notifica cliente`

## Produção — zero mock

Nenhum caminho inventa SEFAZ, PIX, boleto ou e-mail.

| Área | Comportamento |
|------|----------------|
| Captura XML | Só live com certificado A1; sem cert = erro |
| E-mail | SMTP obrigatório (`SMTP_*`) |
| WhatsApp | Manual (download + `wa.me`) |
| Pagamento | Só `barcode` / `pixPayload` oficiais + comprovante |
| Pipeline PAY/CLOSE | Bloqueia sem guia realmente paga |
| Auth | `/setup` cria o 1º escritório real; login com slug |

`ALLOW_DEMO=false` em produção. Health: `GET /api/health`

## Setup

```bash
cp .env.example .env   # preencha AUTH_SECRET forte + SMTP_*
npm install
npm run db:setup
npm run dev
```

1. Abra [http://localhost:3000/setup](http://localhost:3000/setup) e crie o escritório
2. Entre em [/login](http://localhost:3000/login) com slug + e-mail + senha
3. Cadastre clientes, certificados A1 e guias reais

## Segurança — GitHub token

**Nunca** cole Personal Access Tokens no chat, em arquivos commitados ou em URLs de remote.

## Docs

- [PRODUCT.md](docs/PRODUCT.md)
- [BENCHMARK.md](docs/BENCHMARK.md)
- [ROADMAP.md](docs/ROADMAP.md)
