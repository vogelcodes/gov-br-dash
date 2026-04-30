# gov-br-dash

Serviço web comercial para acesso a dados públicos do gov.br.

## Stack

- **Runtime**: Node.js 20+
- **Linguagem**: TypeScript
- **HTTP Server**: Fastify
- **Testes**: Vitest
- **Validação**: Zod

## Requisitos

- Node.js >= 20.0.0
- npm >= 10.0.0

## Instalação

```bash
npm install
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
  -e GOVBR_API_BASE_URL=https://api.gov.br \
  gov-br-dash:latest
```

## Configuração

Defina as variáveis de ambiente (veja `.env.example`):

```bash
cp .env.example .env
```

### Variables de Ambiente

| Variável                     | Obrigatório | Padrão             | Descrição                               |
| ---------------------------- | ----------- | ------------------ | --------------------------------------- |
| `NODE_ENV`                   | Sim         | `development`      | Ambiente: development, production, test |
| `PORT`                       | Não         | `3000`             | Porta HTTP                              |
| `LOG_LEVEL`                  | Não         | `info`             | Nível de log                            |
| `GOVBR_API_BASE_URL`         | Não         | Portal Transparência | URL base do Portal da Transparência   |
| `GOVBR_API_KEY`              | Sim         | —                  | Chave de API do Portal da Transparência |
| `GOVBR_API_TIMEOUT_MS`       | Não         | `5000`             | Timeout do Portal da Transparência     |
| `COMPRAS_GOV_API_BASE_URL`   | Não         | Dados Abertos      | URL base da API Compras.gov.br          |
| `COMPRAS_GOV_API_TIMEOUT_MS` | Não         | `30000`            | Timeout em ms                           |
| `COMPRAS_GOV_MAX_RETRIES`    | Não         | `3`                | Tentativas em falhas transitórias       |
| `COMPRAS_GOV_RETRY_DELAY_MS` | Não         | `500`              | Delay base entre retries                |
| `SQLITE_DB_PATH`             | Não         | `data/app.sqlite`  | Caminho do banco SQLite                 |
| `SESSION_COOKIE_SECRET`      | Não         | dev secret         | Segredo para cookies assinados          |
| `SESSION_TTL_SECONDS`        | Não         | `2592000`          | TTL das sessões                         |
| `CACHE_DEFAULT_TTL_SECONDS`  | Não         | `60`               | TTL padrão do cache                     |
| `UASG_CACHE_TTL_SECONDS`     | Não         | `86400`            | TTL de cache para consulta de UASG      |
| `CACHE_MAX_ENTRIES`          | Não         | `10000`            | Máximo de entradas no cache             |
| `RATE_LIMIT_MAX`             | Não         | `100`              | Requisições por janela                  |
| `RATE_LIMIT_WINDOW_SECONDS`  | Não         | `60`               | Janela de rate limit                    |
| `CORS_ORIGIN`                | Não         | `*`                | Origem CORS                             |

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

### POST /api/auth/signup

Cria um usuário com email/senha, normaliza email, salva hash `scrypt` e inicia sessão via cookie `session` HttpOnly.

### POST /api/auth/login

Valida credenciais e inicia sessão via cookie `session` HttpOnly.

### POST /api/auth/logout

Revoga a sessão atual e limpa o cookie.

### GET /api/auth/me

Retorna o usuário autenticado ou `401` quando não há sessão válida.

### GET /api/me/uasgs

Lista as UASGs vinculadas ao usuário autenticado.

### POST /api/me/uasgs

Vincula uma UASG ao usuário autenticado. Aceita `codigoUasg` com ou sem máscara, valida contra o serviço de UASG e limita a 3 vínculos por usuário.

### DELETE /api/me/uasgs/:codigoUasg

Remove um vínculo de UASG do usuário autenticado.

### GET /api/arps/uasg/:codigoUasg

Consulta ARPs da Unidade Gerenciadora/UASG no endpoint `GET /modulo-arp/1_consultarARP` da API Compras.gov.br Dados Abertos.

Path params:

- `codigoUasg` (obrigatório) — código UASG com 6 dígitos, aceita com ou sem máscara

Resposta:

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

Para cada ARP encontrada, o serviço consulta os itens vinculados em `GET /modulo-arp/2.1_consultarARPItem_Id` usando `numeroControlePncpAta`.

### GET /api/pessoas/juridica

Proxy seguro para `GET /api-de-dados/pessoa-juridica` do Portal da Transparência.

Query params:

- `cnpj` (obrigatório) — aceita com ou sem máscara

### GET /api/pessoas/fisica

Proxy seguro para `GET /api-de-dados/pessoa-fisica` do Portal da Transparência.

Query params:

- `cpf` (opcional)
- `nis` (opcional)

Regra: é obrigatório informar ao menos `cpf` **ou** `nis`.

### GET /health

Retorna status de saúde do serviço.

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.45
}
```

### GET /version

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

## Arquitetura

```
src/
├── server.ts          # Bootstrap HTTP
├── app.ts             # Composição da aplicação
├── config/
│   └── index.ts       # Validação de env vars
├── routes/
│   ├── health.ts      # GET /health
│   ├── auth.ts        # Autenticação e sessões
│   ├── me-uasgs.ts    # UASGs do usuário autenticado
│   └── version.ts     # GET /version
├── auth/              # Hash de credenciais e tokens
├── db/                # SQLite persistente
├── services/          # Regras de negócio
├── clients/           # Clientes externos
├── cache/
│   ├── store.ts       # Interface CacheStore
│   └── in-memory.ts   # Implementação in-memory
└── security/          # Middlewares de segurança

tests/
├── unit/              # Testes unitários
└── integration/       # Testes integrados
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
- **CORS**: configurável
- **Validação de input**: Zod em todas as entradas
- **Timeouts**: em todas as chamadas HTTP externas
- **Audit**: `npm audit` roda no CI

## CI/CD

GitHub Actions executa em todo push:

1. `npm run verify` — typecheck + lint + test + security audit
2. CodeQL para análise estática

## Contributing

Consulte `AGENT.md` para as regras de desenvolvimento.

## License

MIT
