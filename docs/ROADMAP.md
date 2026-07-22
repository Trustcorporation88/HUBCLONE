# Roadmap

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

## Fase 2 — 6 meses

- [ ] Auditoria pré-SPED com regras
- [ ] Apuração assistida DAS/ICMS
- [ ] Integração PSP bancário (opcional, além do código oficial)
- [ ] E-sign + propostas no app cliente

## Fase 3 — 12 meses

- [ ] Firm P&L (horas × margem × risco)
- [ ] Advisory automático
- [ ] CBS/IBS + split payment
- [ ] Agente IA de fechamento
