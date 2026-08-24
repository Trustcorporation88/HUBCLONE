# Postgres no Supabase — passo a passo

## 1. Usar o banco do projeto Supabase

1. Abra o projeto Supabase configurado para o escritório.
2. Em **Project Settings → Database**, copie a connection string PostgreSQL.
3. Use a string direta para migrations ou a string do pooler para runtime serverless.

## 2. Ligar no app

1. Configure `DATABASE_URL` com a connection string do Supabase.
2. Configure também `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_STORAGE_BUCKET`.
3. O bucket privado usado pelo app é `hub-files`.

## 3. Aplicar o schema

1. Rode `npm run db:push` para sincronizar o Prisma com o PostgreSQL do Supabase.
2. Rode `npm run build` para validar geração Prisma, build Next.js e tipos.

## 4. Depois do deploy

1. Abra `/setup` se o banco estiver vazio e crie o escritório.
2. Confira `GET /api/health`

## Local (opcional)

Use a URL do Supabase no `.env` local, ou um Postgres Docker para desenvolvimento isolado:

```bash
docker run --name hub-pg -e POSTGRES_PASSWORD=hub -e POSTGRES_DB=hub -p 5432:5432 -d postgres:16
# DATABASE_URL="postgresql://postgres:hub@localhost:5432/hub"
npm run db:push
```
