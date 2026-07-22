# HUB Contábil OS

Sistema para escritórios de contabilidade — **melhor que qualquer concorrente isolado**, construído do zero com o best-of-breed de HubStrom, Confi, Qive, Jettax, Dootax, Karbon, TaxDome e outros.

## Tese

Ninguém no Brasil une:

1. **Practice management** (nível Karbon/TaxDome)
2. **Fiscal nativo** (nível Jettax/Qive)
3. **Execução financeira** (nível Dootax)

num único fluxo:

`captura → audita → apura → guia → paga → prova → fecha tarefa → notifica cliente`

## MVP Fase 1 (piloto DAS Simples)

- Tarefas / processos
- Guias & obrigações
- XML compra/venda + auditoria
- **Fiscal Autopilot** (pipeline com aprovação humana)
- Base de conhecimento dos benchmarks embutida no app

## Stack

- Next.js 15 (App Router) + TypeScript
- Prisma + SQLite (dev)
- Tailwind CSS 4
- SEFAZ NFeDistribuicaoDFe (mTLS A1) + mock DistDFe

## Setup

```bash
npm install
npm run db:setup
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) → **Entrar**.

Demo: `owner@trust.demo` / `hub123` (ou `fiscal@trust.demo` / `hub123`)

## Segurança — GitHub token

**Nunca** cole Personal Access Tokens no chat, em arquivos commitados ou em URLs de remote.

1. Revogue o PAT que foi exposto no chat: GitHub → Settings → Developer settings → Tokens
2. Gere um novo com escopo mínimo (`repo`)
3. Autentique com Git Credential Manager ou `gh auth login`

```bash
git remote add origin https://github.com/Trustcorporation88/HUBCLONE.git
git add .
git commit -m "feat: bootstrap HUB Contábil OS MVP"
git push -u origin main
```

## Docs

- [docs/PRODUCT.md](docs/PRODUCT.md) — visão e moats
- [docs/BENCHMARK.md](docs/BENCHMARK.md) — matriz competitiva
- [docs/ROADMAP.md](docs/ROADMAP.md) — fases

## Repo

https://github.com/Trustcorporation88/HUBCLONE
