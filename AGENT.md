# AGENT.md — gov-br-dash

## 1. Missão do Projeto

Serviço web comercial para acesso a dados públicos do gov.br.
Prioridades: confiabilidade, segurança, rastreabilidade, testes e releases pequenos.

---

## 2. Regras de Ouro para Agentes

- **TDD obrigatório**: sempre escrever o teste antes do código.
- **Nenhuma feature sem teste automatizado**: sem teste, não commit.
- **Cada mudança pequena e reversível**: cada commit é production-ready.
- **Refactoring contínuo**: não empilhar código, podar regularmente.
- **Nunca aceitar atalhos inseguros**: segurança é hábito, não fase.
- **Documentação constante**: cada decisão relevante documentada.
- **O humano decide o quê; o agente decide o como**.

---

## 3. Fluxo Obrigatório de Desenvolvimento

1. Entender requisito claramente antes de começar.
2. Escrever ou ajustar o teste **primeiro**.
3. Implementar o mínimo necessário para o teste passar.
4. Rodar: testes → lint → typecheck → security checks.
5. Refatorar mantendo todos os testes verdes.
6. Atualizar documentação se comportamento mudou.
7. Commitar mudança pequena e coesa.

---

## 4. Arquitetura Geral

```
src/
├── server.ts          # Bootstrap HTTP — porta, listeners
├── app.ts             # Composição da aplicação Fastify
├── config/
│   └── index.ts       # Leitura e validação de env vars
├── routes/
│   ├── health.ts      # GET /health
│   └── version.ts     # GET /version
├── services/
│   └── example.ts     # Regras de negócio
├── clients/
│   └── govbr.ts       # Client para APIs externas
├── cache/
│   ├── store.ts       # Interface CacheStore (abstraída)
│   └── in-memory.ts   # Implementação in-memory com TTL
└── security/
    └── index.ts       # Middlewares: rate-limit, helmet, cors

tests/
├── unit/
│   ├── cache/
│   │   ├── store.test.ts
│   │   └── in-memory.test.ts
│   └── services/
│       └── example.test.ts
└── integration/
    ├── health.test.ts
    └── version.test.ts
```

### Princípios Arquiteturais

- **Separação de concerns**: rotas → services → clients/cache.
- **Cache abstrato**: interface `CacheStore` para trocar implementação (in-memory → Redis) sem mudar lógica de negócio.
- **Client mockável**: toda integração externa atrás de interface testável.
- **Config via env vars**: nunca hardcoded.
- **Arquivos pequenos**: máximo ~150 linhas por arquivo; acima disso, refatorar.

---

## 5. Política de Cache para gov.br

Toda integração externa **deve** passar por service/client com cache.

### Regras

- `CacheStore` com interface: `get`, `set`, `delete`, `getOrSet`.
- TTL configurável por tipo de dado via env vars.
- Deduplicação de chamadas em voo: se 50 requisições simultâneas pedem a mesma chave e ela expirou, apenas **1** chamada bate na API upstream.
- Chave determinística: normalizar parâmetros antes de gerar cache key.
- Negative caching curto para falhas temporárias.
- Servir stale-while-revalidate opcional por endpoint (decisão explícita).

### TTLs Sugeridos (via env vars)

| Dado                | TTL Padrão | TTL Stale |
| ------------------- | ---------- | --------- |
| Metadados estáveis  | 3600s (1h) | 7200s     |
| Consultas dinâmicas | 60s        | 120s      |
| Falhas temporárias  | 10s        | 20s       |

---

## 6. Configuração de Dependências

### Runtime (mínimas)

- `fastify` — HTTP server
- `@fastify/cors` — CORS explícito
- `@fastify/helmet` — Security headers
- `@fastify/rate-limit` — Rate limiting
- `axios` — HTTP client para APIs externas
- `zod` — Validação de schemas e env vars

### Dev (qualidade e segurança)

- `typescript`
- `vitest` — Test runner
- `eslint` + `@typescript-eslint`
- `prettier`
- `npm-audit-resolver` ou checagem via CI
- `@types/*` conforme necessário

### Regra para novas dependências

Antes de adicionar qualquer pacote:

1. Justificar necessidade no PR.
2. Verificar: manutenção ativa, histórico de vulnerabilidades, licença compatível.
3. Rodar `npm audit` e `npm outdated`.
4. Atualizar este documento se a dependência exige novo env var.

---

## 7. ENV VARs

| Variável                    | Obrigatório | Padrão        | Descrição                                         |
| --------------------------- | ----------- | ------------- | ------------------------------------------------- |
| `NODE_ENV`                  | Sim         | `development` | `development` \| `production` \| `test`           |
| `PORT`                      | Não         | `3000`        | Porta HTTP                                        |
| `LOG_LEVEL`                 | Não         | `info`        | `debug` \| `info` \| `warn` \| `error`            |
| `GOVBR_API_BASE_URL`        | Sim\*       | —             | URL base da API gov.br                            |
| `GOVBR_API_TIMEOUT_MS`      | Não         | `5000`        | Timeout em ms para chamadas upstream              |
| `CACHE_DEFAULT_TTL_SECONDS` | Não         | `60`          | TTL padrão do cache                               |
| `CACHE_STALE_TTL_SECONDS`   | Não         | `120`         | TTL stale do cache                                |
| `CACHE_MAX_ENTRIES`         | Não         | `10000`       | Máximo de entradas no cache in-memory             |
| `RATE_LIMIT_MAX`            | Não         | `100`         | Requisições máximas por janela                    |
| `RATE_LIMIT_WINDOW_SECONDS` | Não         | `60`          | Janela de rate limit em segundos                  |
| `CORS_ORIGIN`               | Não         | `*`           | Origem permitida para CORS                        |
| `REDIS_URL`                 | Não         | —             | URL do Redis (futuro; se setado, cache usa Redis) |

\*Obrigatório quando `NODE_ENV=production`.

### Validação

Todas as env vars são validadas com **Zod** na inicialização. Valores inválidos ou faltando em produção causam erro de startup com mensagem clara.

---

## 8. Security Checks Obrigatórios

Executar em **todo commit** e no CI:

```bash
# 1. Typecheck
npm run typecheck

# 2. Lint
npm run lint

# 3. Testes
npm test

# 4. Audit de segurança
npm audit

# 5. Verificação completa (tipo make verify)
npm run verify
```

### CI GitHub Actions (por commit)

- `npm run verify` completo (typecheck + lint + testes + audit).
- **CodeQL** para análise estática.
- **Dependabot** habilitado para atualizações automáticas.
- **Brakeman** (se Ruby) ou equivalente de SCA para dependências.

### Regras de Código

- **Nunca commitar segredos**: usar `.env.example`, nunca `.env` com valores reais.
- **Validação rigorosa de input**: Zod schemas em todo endpoint.
- **Rate limit em todos os endpoints**.
- **Helmet** habilitado em todos os ambientes.
- **CORS explícito**: origem específica, não `*` em produção.
- **Timeouts em todas as chamadas HTTP externas**.
- **Logs sem PII**: não logar CPF, senhas, tokens.

---

## 9. Comandos Padrão

| Comando                  | Descrição                                 |
| ------------------------ | ----------------------------------------- |
| `npm test`               | Rodar todos os testes (Vitest)            |
| `npm run lint`           | ESLint em src/ e tests/                   |
| `npm run typecheck`      | TypeScript sem compilar                   |
| `npm run format`         | Prettier auto-format                      |
| `npm run security:audit` | npm audit                                 |
| `npm run verify`         | **Tudo**: typecheck + lint + test + audit |
| `npm run dev`            | Desenvolvimento com watch                 |
| `npm run build`          | Compilar TypeScript                       |
| `npm run start`          | Iniciar produção                          |

---

## 10. Critérios de Pronto

Antes de marcar PR como pronto:

- [ ] Teste escrito **antes** do código.
- [ ] Testes passando (`npm test` verde).
- [ ] Typecheck passando (`npm run typecheck` verde).
- [ ] Lint passando (`npm run lint` verde).
- [ ] Security audit sem vulnerabilidades críticas/altas.
- [ ] Se nova dependência: justification no PR + audit rodado.
- [ ] Se mudou comportamento: `AGENT.md` ou `README.md` atualizado.
- [ ] Se novo env var: documentado neste arquivo.
- [ ] Arquivo único com mais de ~150 linhas? Refatorar antes de commit.
- [ ] Código duplicado? Extrair para função/módulo.
- [ ] Se cache foi alterado: testes de hit/miss/TTL atualizados.

---

## 11. Quando Pedir Ajuda ao Humano

- Requisito ambíguo ou contraditório.
- Decisão de segurança com impacto de compliance.
- Mudança de arquitetura que afeta múltiplos módulos.
- Quando o humano pedir algo inseguro ou over-engineered.
- Quando não houver teste para uma mudança não-trivial.

---

## 12. Estilo de Commits

Formato: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `security`, `chore`

Exemplos:

- `feat(cache): add in-memory store with TTL`
- `test(health): add integration test for GET /health`
- `security: add rate limiting to all routes`
- `docs(AGENT): add cache policy section`
- `refactor(routes): extract validation to schema layer`
