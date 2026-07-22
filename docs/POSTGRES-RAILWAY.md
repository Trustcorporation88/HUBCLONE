# Postgres no Railway — passo a passo

## 1. Criar o banco

1. Abra o projeto **HUBCLONE** em [railway.app](https://railway.app)
2. **+ New** → **Database** → **PostgreSQL**
3. Espere o Postgres ficar **Online**

## 2. Ligar no app (HUBCLONE / web)

1. Clique no serviço da **aplicação** (não no Postgres)
2. Aba **Variables**
3. **Add variable** → **Add Reference** (ou Variable Reference):
   - Nome: `DATABASE_URL`
   - Valor: referência do Postgres → `DATABASE_URL`  
     (fica algo como `${{Postgres.DATABASE_URL}}`)
4. **Apague** o valor antigo `file:./dev.db` se ainda existir

## 3. Redeploy

1. Deployments → **Redeploy** (ou push neste repo)
2. No build roda `prisma db push` e cria as tabelas no Postgres

## 4. Depois do deploy

1. Abra `/setup` e **crie o escritório de novo** (banco novo = vazio)
2. Confira `GET /api/health`

## Local (opcional)

Use a URL pública do Postgres (Railway → Postgres → Connect → public URL) no `.env` local, ou um Postgres Docker:

```bash
docker run --name hub-pg -e POSTGRES_PASSWORD=hub -e POSTGRES_DB=hub -p 5432:5432 -d postgres:16
# DATABASE_URL="postgresql://postgres:hub@localhost:5432/hub"
npm run db:push
```
