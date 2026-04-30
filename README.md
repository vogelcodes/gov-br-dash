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

| Variável                    | Obrigatório | Padrão        | Descrição                               |
| --------------------------- | ----------- | ------------- | --------------------------------------- |
| `NODE_ENV`                  | Sim         | `development` | Ambiente: development, production, test |
| `PORT`                      | Não         | `3000`        | Porta HTTP                              |
| `LOG_LEVEL`                 | Não         | `info`        | Nível de log                            |
| `GOVBR_API_BASE_URL`        | Sim\*       | —             | URL base da API gov.br                  |
| `GOVBR_API_KEY`             | Sim         | —             | Chave de API (header `chave-api-dados`) |
| `GOVBR_API_TIMEOUT_MS`      | Não         | `5000`        | Timeout em ms                           |
| `CACHE_DEFAULT_TTL_SECONDS` | Não         | `60`          | TTL padrão do cache                     |
| `CACHE_MAX_ENTRIES`         | Não         | `10000`       | Máximo de entradas no cache             |
| `RATE_LIMIT_MAX`            | Não         | `100`         | Requisições por janela                  |
| `RATE_LIMIT_WINDOW_SECONDS` | Não         | `60`          | Janela de rate limit                    |
| `CORS_ORIGIN`               | Não         | `*`           | Origem CORS                             |

\*Obrigatório quando NODE_ENV=production.

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
│   └── version.ts     # GET /version
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
