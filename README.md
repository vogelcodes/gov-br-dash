# gov-br-dash

Serviço web comercial para acesso a dados públicos do gov.br, com cache, autenticação multiusuário, persistência SQLite e sincronização de dados por UASG.

## Stack

- **Runtime**: Node.js 20+
- **Linguagem**: TypeScript
- **HTTP Server**: Fastify
- **Testes**: Vitest
- **Validação**: Zod
- **Persistência**: SQLite (`better-sqlite3`)
- **Sessão web**: cookie `session` assinado, `HttpOnly`, `SameSite=Lax`

## Requisitos

- Node.js >= 20.0.0
- npm >= 10.0.0

## Instalação

```bash
npm install
cp .env.example .env
```

Edite `.env` e defina pelo menos `GOVBR_API_KEY`. Em produção, gere também um `COOKIE_SECRET` forte:

```bash
openssl rand -hex 32
```

## Deploy com Docker

### Build da imagem

```bash
docker build -t gov-br-dash:latest .
```

### Executar container

```bash
docker run --rm -p 3000:3000 --env-file .env gov-br-dash:latest
```

### Executar com variáveis diretas

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e LOG_LEVEL=info \
  -e GOVBR_API_BASE_URL=https://api.portaldatransparencia.gov.br \
  -e GOVBR_API_KEY="replace-me" \
  -e SQLITE_DB_PATH=/data/app.sqlite \
  -e COOKIE_SECRET="replace-with-32-plus-chars" \
  gov-br-dash:latest
```

## Configuração

Defina as variáveis de ambiente (veja `.env.example`):

| Variável                     | Obrigatório | Padrão                                  | Descrição |
| ---------------------------- | ----------- | --------------------------------------- | --------- |
| `NODE_ENV`                   | Sim         | `development`                           | Ambiente: `development`, `production` ou `test` |
| `PORT`                       | Não         | `3000`                                  | Porta HTTP |
| `LOG_LEVEL`                  | Não         | `info`                                  | Nível de log: `debug`, `info`, `warn`, `error` |
| `GOVBR_API_BASE_URL`         | Não         | `https://api.portaldatransparencia.gov.br` | URL base do Portal da Transparência |
| `GOVBR_API_KEY`              | Sim         | —                                       | Chave de API enviada no header `chave-api-dados` |
| `GOVBR_API_TIMEOUT_MS`       | Não         | `5000`                                  | Timeout do Portal da Transparência em ms |
| `COMPRAS_GOV_API_BASE_URL`   | Não         | `https://dadosabertos.compras.gov.br`   | URL base Compras.gov.br Dados Abertos |
| `COMPRAS_GOV_API_TIMEOUT_MS` | Não         | `30000`                                 | Timeout do Compras.gov.br em ms |
| `COMPRAS_GOV_MAX_RETRIES`    | Não         | `3`                                     | Máximo de retries em falhas transitórias |
| `COMPRAS_GOV_RETRY_DELAY_MS` | Não         | `500`                                   | Delay em ms entre retries |
| `CACHE_DEFAULT_TTL_SECONDS`  | Não         | `60`                                    | TTL padrão do cache |
| `UASG_CACHE_TTL_SECONDS`     | Não         | `86400`                                 | TTL para dados de UASG |
| `CACHE_STALE_TTL_SECONDS`    | Não         | `120`                                   | TTL stale reservado para política stale |
| `CACHE_MAX_ENTRIES`          | Não         | `10000`                                 | Máximo de entradas no cache in-memory |
| `RATE_LIMIT_MAX`             | Não         | `100`                                   | Requisições por janela |
| `RATE_LIMIT_WINDOW_SECONDS`  | Não         | `60`                                    | Janela de rate limit em segundos |
| `CORS_ORIGIN`                | Não         | `*`                                     | Origem CORS permitida |
| `REDIS_URL`                  | Não         | —                                       | Futuro backend Redis para cache |
| `SQLITE_DB_PATH`             | Não         | `data/app.sqlite`                       | Caminho do banco SQLite |
| `COOKIE_SECRET`              | Não*        | `development-cookie-secret-change-me-32` | Secret para assinar cookies, mínimo 32 caracteres |

\* Em produção, use um valor aleatório com pelo menos 32 caracteres.

## Scripts

```bash
# Desenvolvimento com watch
npm run dev

# Compilar TypeScript
npm run build

# Iniciar produção
npm start

# Testes
npm test

# Testes com watch
npm run test:watch

# Testes com coverage
npm run test:coverage

# Lint
npm run lint

# Auto-fix lint
npm run lint:fix

# Typecheck
npm run typecheck

# Format
npm run format

# Security audit
npm run security:audit

# Verificação completa (typecheck + lint + test + audit)
npm run verify
```

## API Endpoints

### Health e versão

#### GET /health

Retorna status de saúde do serviço.

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.45
}
```

#### GET /version

Retorna informações da versão.

```json
{
  "name": "gov-br-dash",
  "version": "0.0.1",
  "description": "Serviço web para acesso a dados públicos do gov.br",
  "nodeVersion": "v20.0.0",
  "environment": "development"
}
```

### Dados públicos sem autenticação

#### GET /api/arps/uasg/:codigoUasg

Consulta ARPs da Unidade Gerenciadora/UASG no endpoint `GET /modulo-arp/1_consultarARP` da API Compras.gov.br Dados Abertos.

Path params:

- `codigoUasg` (obrigatório) — código UASG com 6 dígitos, aceita com ou sem máscara

Para cada ARP encontrada, o serviço consulta os itens vinculados em `GET /modulo-arp/2.1_consultarARPItem_Id` usando `numeroControlePncpAta`.

Resposta resumida:

```json
{
  "resultado": [
    {
      "numeroAtaRegistroPreco": "90018/2025",
      "numeroControlePncpAta": "00394452000103-1-018458/2025-000001",
      "itens": []
    }
  ]
}
```

#### GET /api/pessoas/juridica

Proxy seguro para `GET /api-de-dados/pessoa-juridica` do Portal da Transparência.

Query params:

- `cnpj` (obrigatório) — aceita com ou sem máscara

#### GET /api/pessoas/fisica

Proxy seguro para `GET /api-de-dados/pessoa-fisica` do Portal da Transparência.

Query params:

- `cpf` (opcional)
- `nis` (opcional)

Regra: é obrigatório informar ao menos `cpf` **ou** `nis`.

### Autenticação e sessão

Todos os endpoints de autenticação usam JSON. `signup` e `login` criam uma sessão e retornam cookie `session` assinado, `HttpOnly`, `SameSite=Lax` e `Secure` quando `NODE_ENV=production`.

#### POST /api/auth/signup

Cria usuário com email e senha. A senha deve ter no mínimo 12 caracteres. O email é normalizado para lowercase. Verificação de email ainda não foi implementada.

Body:

```json
{
  "email": "user@example.com",
  "password": "correct horse battery staple"
}
```

Resposta `201`:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": false
  }
}
```

Erros comuns:

- `400` body inválido
- `409` email já cadastrado

#### POST /api/auth/login

Valida email/senha e cria nova sessão.

Body:

```json
{
  "email": "user@example.com",
  "password": "correct horse battery staple"
}
```

Resposta `200`:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": false
  }
}
```

Erros comuns:

- `400` body inválido
- `401` credenciais inválidas

#### POST /api/auth/logout

Revoga a sessão atual quando o cookie existe e limpa o cookie `session`.

Resposta: `204 No Content`.

#### GET /api/auth/me

Retorna o usuário autenticado a partir do cookie `session`.

Resposta `200`:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": false
  }
}
```

Resposta `401` quando não há sessão válida.

### UASGs do usuário autenticado

Todos os endpoints abaixo exigem cookie `session` válido.

#### GET /api/me/uasgs

Lista as UASGs vinculadas ao usuário autenticado.

Resposta `200`:

```json
{
  "uasgs": [
    {
      "codigoUasg": "160082",
      "nomeUasg": "EXEMPLO",
      "createdAt": "2026-04-30T00:00:00.000Z"
    }
  ]
}
```

#### POST /api/me/uasgs

Vincula uma UASG ao usuário autenticado. A regra atual limita cada usuário a no máximo 3 UASGs vinculadas. O serviço consulta Compras.gov.br para validar e armazenar metadados da UASG.

Body:

```json
{
  "codigoUasg": "160082"
}
```

Resposta `201`:

```json
{
  "uasg": {
    "codigoUasg": "160082",
    "nomeUasg": "EXEMPLO"
  }
}
```

Erros comuns:

- `400` body inválido
- `401` não autenticado
- `404` UASG não encontrada
- `409` limite de UASGs atingido
- `502` falha ao consultar/processar dados externos

#### DELETE /api/me/uasgs/:codigoUasg

Remove o vínculo da UASG com o usuário autenticado.

Respostas:

- `204` vínculo removido
- `404` vínculo não encontrado

### Sincronização e refresh de dados do usuário

Todos os endpoints abaixo exigem cookie `session` válido e aplicam isolamento por usuário: o usuário só pode sincronizar ou atualizar dados associados às próprias UASGs/ARPs/itens.

#### POST /api/me/uasgs/:codigoUasg/sync

Sincroniza uma UASG vinculada ao usuário, persistindo UASG, ARPs, itens e fornecedores/CNPJs associados quando disponíveis.

Resposta `200`:

```json
{
  "result": {
    "codigoUasg": "160082",
    "arpsSynced": 1,
    "itemsSynced": 10
  }
}
```

#### POST /api/me/arps/:numeroControlePncpAta/refresh

Atualiza uma ARP já sincronizada para o usuário autenticado.

Resposta `200`:

```json
{
  "result": {
    "numeroControlePncpAta": "00394452000103-1-018458/2025-000001"
  }
}
```

#### POST /api/me/arps/:numeroControlePncpAta/items/:numeroItem/refresh

Atualiza um item de ARP já sincronizado e associado ao usuário autenticado.

Resposta `200` com `{ "result": ... }`.

#### POST /api/me/arps/:numeroControlePncpAta/items/:numeroItem/empenhos/refresh

Atualiza os empenhos de um item de ARP já sincronizado e associado ao usuário autenticado.

Resposta `200` com `{ "result": ... }`.

#### POST /api/me/pessoas-juridicas/:cnpj/refresh

Atualiza os dados de uma pessoa jurídica/CNPJ já associada aos dados sincronizados do usuário autenticado.

Resposta: `204 No Content`.

## Persistência SQLite

O banco é inicializado no boot com `SQLITE_DB_PATH` e cria as tabelas automaticamente quando não existem:

- `users` — usuários, email normalizado, hash de senha e flag `email_verified`
- `sessions` — sessões com hash de token, expiração e revogação
- `uasgs` — metadados de UASGs vindos do Compras.gov.br
- `user_uasgs` — vínculo usuário ↔ UASG
- `arps` — ARPs sincronizadas por UASG
- `arp_items` — itens de ARP e `ni_fornecedor` quando disponível
- `empenhos` — empenhos associados a itens de ARP
- `pessoas_juridicas` — dados de CNPJ vindos do Portal da Transparência

Segurança da persistência:

- Senhas são armazenadas com hash `scrypt` + salt.
- Tokens de sessão são opacos e apenas o hash é persistido.
- Logout revoga a sessão no banco.
- Dados sincronizados são verificados por propriedade antes de refresh protegido.

## Arquitetura

```text
src/
├── server.ts              # Bootstrap HTTP
├── app.ts                 # Composição Fastify, plugins, DB e rotas
├── config/
│   └── index.ts           # Loader .env e validação de env vars
├── db/
│   ├── connection.ts      # Factory SQLite
│   ├── schema.ts          # Schema initialization
│   ├── auth-repository.ts # Repositório users/sessions
│   ├── user-uasg-repository.ts
│   └── sync-repository.ts
├── routes/
│   ├── health.ts          # GET /health
│   ├── version.ts         # GET /version
│   ├── auth.ts            # Auth/session endpoints
│   ├── user-uasgs.ts      # UASGs do usuário autenticado
│   ├── user-sync.ts       # Sync/refresh protegido por usuário
│   ├── arps.ts            # Consulta pública de ARPs por UASG
│   ├── pessoas.ts         # Proxy Portal da Transparência
│   └── uasg.ts            # Consulta pública de UASG
├── services/
│   ├── auth.ts
│   ├── user-uasgs.ts
│   └── user-data-sync.ts
├── clients/
│   ├── compras-gov.ts
│   └── portal-transparencia.ts
├── cache/
│   ├── store.ts
│   └── in-memory.ts
└── security/

tests/
├── unit/
└── integration/
```

## Cache

O projeto inclui uma implementação de cache in-memory com:

- TTL configurável por entrada
- LRU eviction quando máximo de entradas é atingido
- Deduplicação de chamadas em voo (previne cache stampede)
- Estatísticas de hit/miss/eviction
- Abstraído via interface `CacheStore` para futura troca por Redis

## Segurança

- **Rate limiting**: em todos os endpoints
- **Helmet**: headers de segurança
- **CORS**: configurável por env var
- **Validação de input**: Zod em rotas e env vars
- **Timeouts e retries**: em chamadas HTTP externas
- **Sessão segura**: cookie assinado, `HttpOnly`, `SameSite=Lax`, `Secure` em produção
- **Senha segura**: hash `scrypt` + salt, nunca senha em texto puro
- **Token seguro**: token opaco; banco guarda apenas hash
- **Isolamento por usuário**: endpoints `/api/me/*` exigem sessão e verificam ownership
- **Audit**: `npm audit` roda no fluxo `npm run verify`

## CI/CD

GitHub Actions executa em todo push:

1. `npm run verify` — typecheck + lint + test + security audit
2. CodeQL para análise estática

## Contributing

Consulte `AGENT.md` para as regras de desenvolvimento. TDD é obrigatório para mudanças de comportamento; documentação deve acompanhar qualquer endpoint, env var ou contrato novo.

## License

MIT
