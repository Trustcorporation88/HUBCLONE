# ProContador Office — Tutorial de integração
## ProContador · Omie · Domínio

**Versão:** 1.2  
**Produto:** ProContador Office (`office.procontador.com.br`)  
**SaaS irmão:** [www.procontador.com.br](https://www.procontador.com.br) (`contador-saas`)  
**Objetivo:** conectar o escritório e importar clientes/empresas sem dados fictícios.

---

## 0. Integração ProContador (prioridade)

O **ProContador OS** e o site **www.procontador.com.br** são produtos irmãos.  
Esta integração traz as **empresas** do SaaS para a base de **clientes** do OS (upsert por CNPJ).

### 0.1 Pré-requisitos

1. Conta **admin** em [www.procontador.com.br](https://www.procontador.com.br) **sem MFA** (MFA bloqueia o login da API de sync).
2. API online em `https://api.procontador.com.br/api/v1` (override via `PROCONTADOR_API_URL` no Railway se necessário).

### 0.2 Conectar no OS

1. Login no OS → menu **Integrações**.
2. Card **ProContador**:
   - E-mail admin  
   - Senha  
   - API URL (opcional; deixe em branco para o default)
3. **Conectar e testar** → status **CONNECTED**.

### 0.3 Importar empresas

1. Clique em **Importar empresas ProContador**.
2. O OS chama `POST /auth/login` e depois `GET /companies` (paginado).
3. Cada empresa ativa com CNPJ/CPF válido vira `Client` no escritório:
   - novo CNPJ → cria  
   - mesmo CNPJ → atualiza razão, e-mail, telefone, regime  
4. Reexecute quando quiser; não duplica CNPJ.

### 0.4 Problemas comuns (ProContador)

| Sintoma | O que fazer |
|--------|-------------|
| MFA Required | Usar admin sem MFA |
| Login HTTP 401 | Conferir e-mail/senha no SaaS |
| GET /companies falhou | Token inválido ou API fora; checar `api.procontador.com.br` |
| 0 importados | Empresas inativas ou sem CNPJ válido |

> SSO bidirecional (entrar no OS com sessão do SaaS) fica para a próxima etapa. Agora o fluxo é **sync de empresas → clientes**.

---

## 1. Onde fazer no sistema

1. Entre no escritório: `/login` (slug + e-mail + senha).
2. No menu lateral, abra **Integrações**.
3. Escolha o card **ProContador**, **Omie** ou **Domínio Sistemas**.

---

## 2. Integração Omie (API oficial)

Omie possui API pública. O ProContador OS testa a conexão e **importa clientes de verdade**.

### 2.1 Obter App Key e App Secret

1. Acesse [https://app.omie.com.br](https://app.omie.com.br) com o usuário administrador.
2. Vá em **Perfil / Desenvolvedor** (ou **API** / área de desenvolvedor Omie).
3. Crie ou copie:
   - **App Key**
   - **App Secret**
4. Confirme que o aplicativo tem permissão de leitura de **Clientes**.

> Dica: use um App Key do **ambiente de produção** do escritório que vai operar no ProContador OS. Homologação importa outra base.

### 2.2 Conectar no ProContador OS

1. Em **Integrações → Omie**, preencha:
   - App Key  
   - App Secret  
2. Clique em **Conectar e testar**.
3. Status esperado: **CONNECTED**.  
   Se aparecer ERROR, a mensagem vem da API Omie (chave inválida, app sem permissão, etc.).

### 2.3 Importar clientes

1. Com Omie **CONNECTED**, clique em **Importar clientes Omie**.
2. O sistema chama `ListarClientes` na API oficial e faz **upsert por CNPJ/CPF**:
   - Cliente novo → cria  
   - Mesmo CNPJ → atualiza nome, fantasia e e-mail  
   - Inativos / sem documento válido → ignorados  
3. Ao terminar, confira a lista de clientes no escritório (tarefas / guias / XML usam esses cadastros).

### 2.4 Reimportar

Pode rodar o import de novo a qualquer momento. Não duplica CNPJ: atualiza o existente.

### 2.5 Problemas comuns (Omie)

| Sintoma | O que fazer |
|--------|-------------|
| HTTP 401 / fault de autenticação | Refazer App Key/Secret |
| fault de permissão | Liberar escopo de clientes no app Omie |
| 0 importados | Verificar se há clientes ativos com CNPJ/CPF válidos |
| Timeout | Tentar de novo; bases grandes paginam até 40 páginas (50/registro) |

---

## 3. Integração Domínio Sistemas

### 3.1 Realidade técnica (importante)

O **Domínio Contábil** (Thomson Reuters) **não oferece** uma API pública simples como a Omie para qualquer escritório.

Por isso o ProContador OS trabalha em **dois caminhos**:

| Caminho | Quando usar | Status no produto |
|--------|-------------|-------------------|
| **A) Import CSV** | Escritório tem Domínio e precisa testar **agora** | Disponível |
| **B) API parceiro** | Trust/escritório tem credencial Thomson/Onvio (baseUrl + token) | Conector pronto; ativa só com token real |

Não inventamos sync “fake” com Domínio.

### 3.2 Caminho A — Exportar do Domínio e importar CSV (recomendado para o piloto)

#### Passo a passo no Domínio Contábil

Os menus variam por versão. Em geral:

1. Abra o **Domínio Contábil** no escritório.
2. Localize o cadastro de **Empresas / Clientes / Contribuintes** (nome depende da versão).
3. Use **Exportar**, **Relatório** ou **Lista para Excel/CSV**.
4. Exporte a planilha e salve como **CSV (UTF-8)** se o Excel pedir formato.
5. Garanta colunas equivalentes a:

```text
cnpj;razao_social;nome_fantasia;email;regime
```

Exemplos de cabeçalhos aceitos pelo import:

- `cnpj` ou `cpf`  
- `razao_social` / `razao social` / `nome`  
- `nome_fantasia` / `fantasia` (opcional)  
- `email` (opcional)  
- `regime` (opcional: SIMPLES, LUCRO_PRESUMIDO, LUCRO_REAL, MEI)

Separador: **`;`** (preferencial) ou **`,`**.

#### Exemplo mínimo de arquivo

```csv
cnpj;razao_social;nome_fantasia;email;regime
12345678000199;ALPHA COMERCIO LTDA;Alpha;financeiro@alpha.com.br;SIMPLES
98765432000111;BETA SERVICOS SA;Beta;contato@beta.com.br;LUCRO_PRESUMIDO
```

#### Importar no ProContador OS

1. **Integrações → Domínio Sistemas**.
2. Clique em **Importar CSV Domínio**.
3. Selecione o arquivo `.csv`.
4. Resultado: `X novos · Y atualizados · Z ignorados`.
5. Status da integração passa a **CONNECTED** no modo `CSV_IMPORT`.

#### Boas práticas Domínio → CSV

- Exporte só empresas **ativas**.  
- CNPJ com ou sem máscara (o sistema remove pontuação).  
- CPF (11 dígitos) também entra no campo de documento.  
- Não misture outras abas/relatórios no mesmo arquivo.  
- Se o Excel bagunçar o CNPJ (notação científica), formate a coluna como **Texto** antes de salvar CSV.

### 3.3 Caminho B — API parceiro (quando existir)

Se a Trust ou o escritório tiver acesso a API Domínio/Onvio de parceiro:

1. Em Integrações → Domínio → **Tenho API parceiro Domínio?**
2. Informe:
   - **Base URL** da API  
   - **API Token**  
3. **Conectar e testar** (o sistema chama `{baseUrl}/health` com Bearer token).
4. Sem baseUrl + token válidos, permanece desconectado — sem mock.

> Enquanto a API parceira não estiver contratada/documentada para o tenant, use o **CSV** no piloto.

---

## 4. Checklist rápido para o escritório piloto

### Omie
- [ ] App Key e App Secret de produção  
- [ ] Conectar e testar = CONNECTED  
- [ ] Importar clientes Omie  
- [ ] Conferir clientes no ProContador OS  

### Domínio
- [ ] Exportar clientes do Domínio Contábil  
- [ ] Ajustar cabeçalhos do CSV  
- [ ] Importar CSV Domínio no ProContador OS  
- [ ] Conferir clientes importados  
- [ ] (Opcional) Guardar credenciais de API parceiro para fase 2  

---

## 5. Segurança

- Não compartilhe App Secret / tokens em e-mail ou chat.  
- Credenciais ficam **criptografadas** no banco do ProContador OS.  
- Não versionar `.env` nem planilhas com dados sensíveis de clientes.  
- Após o piloto, revogue chaves de teste e gere novas de produção.

---

## 6. Suporte Trust / ProContador OS

- URL do sistema: `https://contabil.trustcorp.com.br`  
- Setup inicial: `/setup`  
- Login escritório: `/login`  
- Integrações: `/app/integrations`  

Dúvidas de API Omie: documentação oficial em [developer.omie.com.br](https://developer.omie.com.br).  
Dúvidas Domínio API parceiro: canal Thomson Reuters / Onvio do contrato do escritório.

---

*Documento gerado para o ProContador OS — Trust Corporation. Uso interno e onboarding de escritórios piloto.*
