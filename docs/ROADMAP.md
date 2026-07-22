# Roadmap — ProContador OS

## Fase 1 — 90 dias (atual)

- [x] Scaffold Next.js + Prisma
- [x] Domínio: Firm, Client, Task, Obligation, XmlDocument, FiscalPipeline
- [x] UI: painel, tarefas, guias, XML, autopilot, knowledge
- [x] API: avançar estágio do pipeline (aprovação humana)
- [x] Auth multi-tenant real + bootstrap do 1º escritório (`/setup`)
- [x] Portal do cliente white-label (`/portal`)
- [x] WhatsApp manual (download + wa.me); e-mail SMTP real
- [x] Captura SEFAZ DistDFe NF-e + CT-e live (A1 mTLS); NFS-e ADN live
- [x] Pagamento: só código oficial (`barcode` / `pixPayload`) + comprovante
- [x] Política zero-mock: sem fallback inventado em SEFAZ, e-mail ou pagamento
- [x] Capacidade e fila por setor
- [x] P&L interno (horas × margem)
- [x] SLA monitorado WhatsApp/e-mail
- [x] Bloqueio de fechamento com XML inconsistente
- [x] Marketplace Domínio / Omie / ClickSign / OpenAI
- [x] Assinatura digital (PDF assinado)
- [x] Inbox foto/PDF + OpenAI
- [x] Saúde fiscal (CND/certificado/atrasos/XML)
- [x] Dashboard advisory no portal

## Fase 2 — 6 meses

- [ ] Auditoria pré-SPED com regras avançadas
- [ ] Apuração assistida DAS/ICMS
- [ ] Integração PSP bancário (opcional, além do código oficial)
- [ ] ClickSign end-to-end (além do conector)

## Fase 3 — 12 meses

- [ ] Firm P&L com risco + pricing
- [ ] Advisory prescritivo (recomendações)
- [ ] CBS/IBS + split payment
- [ ] Agente IA de fechamento
