# WhatsApp Manager API

Sistema completo de gerenciamento de WhatsApp com suporte multi-provedor: Baileys (QR Code), Meta Cloud API e Coexistencia (hibrido).

## Funcionalidades

### Conexao e Instancias
- Multi-instancias (varios numeros WhatsApp simultaneos)
- **Baileys** - Conexao via QR Code (WebSocket, sem custos)
- **Meta Cloud API** - WhatsApp Business oficial com templates
- **Coexistencia** - Canal hibrido: Baileys (envio) + Cloud API (recebimento) na mesma instancia
- Reconexao automatica de instancias
- Status em tempo real via Socket.IO

### Flow Builder (Chatbot Visual)
- Editor visual drag-and-drop com React Flow
- Nodes disponiveis: Mensagem, Imagem, Audio, Video, Documento, Menu, Botoes, Lista, Condicao, Delay, Variavel, HTTP Request, Transferir, Ir para Fluxo, Fim
- **Handles em 4 lados** (Top/Bottom/Left/Right) com labels coloridos por opcao
- **Condition switch/case** com multiplos valores, operadores (equals, contains, startsWith, regex) e fallback
- **Aguardar resposta** (waitForInput) em nodes de Mensagem - pergunta ao usuario e salva em variavel
- **HTTP Request** com mapeamento de resposta (suporte a nested paths ex: `tokens.access_token`)
- **Node Delay** para pausar execucao entre nodes (1-300 segundos)
- Teste de requisicoes HTTP direto no editor (proxy server-side, sem CORS)
- Custom edges com botao de deletar e angulos retos
- Gatilhos: palavra-chave, todas mensagens, resposta de botao, resposta de lista, webhook externo
- Variaveis do sistema: `{{_contactName}}`, `{{_contactPhone}}`, `{{_triggerMessage}}`, `{{_menuSelection}}`

### Timeout de Inatividade
- Encerramento automatico de sessoes de fluxo por inatividade
- Tempo configuravel por fluxo (1-60 minutos, default 5 min)
- Mensagem de encerramento customizavel
- Job automatico verifica sessoes a cada 30 segundos

### Mensagens
- Envio de texto, imagem, audio, video, documento
- Mensagens interativas (botoes e listas) via Baileys com NativeFlowMessage
- Envio de templates Meta com componentes dinamicos (header, body, buttons)
- Suporte a ORDER_DETAILS template type
- Upload de media via Meta Graph API
- Historico completo de mensagens (enviadas/recebidas)

### Janela 24 Horas (Window Subscribers)
- Gestao da janela de 24h do WhatsApp Business
- Cadastro de numeros que precisam de janela aberta
- Job automatico monitora e notifica antes da janela expirar
- Pagina frontend para gerenciar subscribers

### Automacoes
- Disparo automatico de mensagens via API externa
- Template routing (FATURA_DIA, DISPARO_LIVRE)
- Template codes ($Template1, $Template2, etc.) para roteamento automatico
- Variable mapping com campos customizados
- Logs detalhados de execucao por automacao

### Integracoes
- **Typebot** - Integre chatbots Typebot com deteccao de conflito com Flow nativo
- **n8n** - Webhooks para automacao com n8n
- **Webhooks personalizados** - Receba eventos em qualquer URL
- **Webhook de entrada** - Receba dados externos para disparar acoes

### Campanhas
- Disparo em massa com controle de velocidade
- Delay configuravel entre mensagens
- Status: rascunho, agendada, em execucao, pausada, concluida
- Contadores de enviados, entregues e falhos

### Administracao
- Painel administrativo completo
- Gerenciamento de usuarios e empresas
- Controle de permissoes (Admin/Operador)
- Sistema de atualizacao automatica com progresso em tempo real
- API Docs integrada ao frontend
- Rate limiter para protecao de endpoints

## Stack Tecnologica

| Componente | Tecnologia |
|---|---|
| Backend | Node.js + Fastify + TypeScript |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Banco de Dados | PostgreSQL + Prisma ORM |
| Cache/Filas | Redis + Bull |
| WebSocket | Socket.IO |
| WhatsApp | @whiskeysockets/baileys ^6.6.0 |
| Process Manager | PM2 |

## Requisitos

- Ubuntu 20.04+ ou Debian 11+
- 2GB RAM minimo (4GB recomendado)
- 20GB de disco
- Dominio apontando para o servidor
- Portas 80 e 443 abertas

## Instalacao Rapida

```bash
# Clonar repositorio
git clone https://github.com/theangelz/whatsapp-manager.git
cd whatsapp-manager

# Executar instalador
sudo chmod +x install.sh
sudo ./install.sh
```

O instalador vai:
1. Instalar todas as dependencias (Docker, Node.js, PM2)
2. Configurar o banco de dados PostgreSQL
3. Configurar SSL automatico com Let's Encrypt
4. Iniciar todos os servicos

## Instalacao Manual

### 1. Instalar dependencias

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PM2
npm install -g pm2
```

### 2. Configurar banco de dados

```bash
# Iniciar PostgreSQL e Redis com Docker
docker run -d \
  --name whatsapp_postgres \
  -e POSTGRES_USER=whatsapp \
  -e POSTGRES_PASSWORD=sua_senha \
  -e POSTGRES_DB=whatsapp_manager \
  -p 5432:5432 \
  postgres:15-alpine

docker run -d \
  --name whatsapp_redis \
  -p 6379:6379 \
  redis:7-alpine
```

### 3. Configurar backend

```bash
cd backend
cp .env.example .env
# Edite o arquivo .env com suas configuracoes

npm install
npx prisma migrate deploy
npx prisma db seed
npm run build
```

### 4. Configurar frontend

```bash
cd frontend
cp .env.example .env
# Edite o arquivo .env com suas configuracoes

npm install
npm run build
```

### 5. Iniciar aplicacao

```bash
cd backend
pm2 start dist/server.js --name whatsapp-backend

pm2 save
pm2 startup
```

O frontend e servido automaticamente pelo backend (SPA fallback).

## Variaveis de Ambiente

### Backend (.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_manager"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="seu_jwt_secret_muito_seguro"
PORT=3333
NODE_ENV=production
FRONTEND_URL="https://seu-dominio.com"
BAILEYS_SESSIONS_PATH="./sessions"
META_WEBHOOK_VERIFY_TOKEN="token_para_meta"
```

### Frontend (.env)

```env
VITE_API_URL=https://seu-dominio.com/api
```

## Credenciais Padrao

- **Email:** admin@whatsapp.local
- **Senha:** admin123

**IMPORTANTE:** Troque a senha apos o primeiro login!

## Configuracao Meta Cloud API

1. Acesse o [Meta Business Suite](https://business.facebook.com)
2. Crie um App de negocio
3. Adicione o produto WhatsApp
4. Obtenha o Access Token permanente
5. Configure o Webhook com a URL:
   ```
   https://seu-dominio.com/api/webhook/cloud-api/{instanceId}
   ```
6. Inscreva-se no campo "messages"

## Estrutura do Projeto

```
whatsapp-manager/
├── backend/
│   ├── src/
│   │   ├── config/         # Configuracoes (env, database, redis)
│   │   ├── core/           # Modulo core e control server
│   │   ├── jobs/           # Background jobs (flow-timeout, window-notifier)
│   │   ├── middlewares/    # Rate limiter, auth
│   │   ├── modules/
│   │   │   ├── admin/      # Painel admin e atualizacoes
│   │   │   ├── auth/       # Autenticacao JWT
│   │   │   ├── automations/# Automacoes de disparo
│   │   │   ├── campaigns/  # Campanhas em massa
│   │   │   ├── contacts/   # Gerenciamento de contatos
│   │   │   ├── flows/      # Flow Builder engine + routes
│   │   │   ├── instances/  # Gerenciamento de instancias
│   │   │   ├── messages/   # Envio e historico de mensagens
│   │   │   ├── n8n/        # Integracao n8n
│   │   │   ├── templates/  # Templates Meta
│   │   │   ├── typebot/    # Integracao Typebot
│   │   │   ├── webhooks/   # Webhooks Cloud API
│   │   │   ├── webhook-entrada/ # Webhooks de entrada
│   │   │   └── window-subscribers/ # Janela 24h
│   │   └── providers/
│   │       ├── baileys/    # Provider Baileys (QR Code)
│   │       └── cloud-api/  # Provider Meta Cloud API
│   └── prisma/             # Schema e migrations
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── flow-builder/  # CustomNodes, NodeProperties, Sidebar, Edges
│   │   │   ├── layout/        # Sidebar, Header
│   │   │   └── ui/            # Componentes base (shadcn/ui)
│   │   ├── hooks/             # Custom hooks
│   │   ├── pages/             # Paginas da aplicacao
│   │   ├── services/          # API client
│   │   └── types/             # TypeScript types
│   └── index.html
└── install.sh                 # Instalador automatico
```

## API Endpoints

### Autenticacao
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login

### Instancias
- `GET /api/instances` - Listar instancias
- `POST /api/instances` - Criar instancia (BAILEYS, CLOUD_API ou COEXISTENCE)
- `POST /api/instances/:id/connect` - Conectar (gerar QR)
- `POST /api/instances/:id/disconnect` - Desconectar
- `DELETE /api/instances/:id` - Remover instancia

### Mensagens
- `POST /api/messages/:instanceId/send` - Enviar mensagem (texto, imagem, audio, video, documento)
- `POST /api/messages/:instanceId/send-template` - Enviar template Meta
- `GET /api/messages/:instanceId` - Historico de mensagens

### Fluxos (Chatbot)
- `GET /api/flows` - Listar fluxos
- `POST /api/flows` - Criar fluxo
- `GET /api/flows/:id` - Detalhes do fluxo com nodes e edges
- `PUT /api/flows/:id` - Atualizar configuracoes (trigger, timeout, mensagem de encerramento)
- `PUT /api/flows/:id/canvas` - Salvar canvas (nodes + edges)
- `POST /api/flows/test-http` - Proxy para testar requisicoes HTTP

### Automacoes
- `GET /api/automations` - Listar automacoes
- `POST /api/automations` - Criar automacao
- `POST /api/automations/:token/trigger` - Disparar automacao via token

### Webhooks
- `GET /api/webhook/cloud-api/:instanceId` - Verificacao Meta
- `POST /api/webhook/cloud-api/:instanceId` - Eventos Meta
- `POST /api/webhook-entrada/:companyId` - Webhook de entrada

### Window Subscribers
- `GET /api/window-subscribers` - Listar subscribers
- `POST /api/window-subscribers` - Criar subscriber
- `DELETE /api/window-subscribers/:id` - Remover subscriber

## Comandos Uteis

```bash
# Ver logs
pm2 logs whatsapp-backend

# Reiniciar
pm2 restart whatsapp-backend

# Status
pm2 status

# Rebuild completo
cd backend && npm run build
cd frontend && npm run build
pm2 restart whatsapp-backend
```

## Changelog

### v2.2.0
- Flow Builder com handles em 4 lados e labels coloridos
- Condition switch/case com multiplos valores e fallback
- MESSAGE com waitForInput para coletar respostas
- HTTP proxy para teste de requisicoes sem CORS
- Timeout de inatividade configuravel com mensagem customizavel
- Canal Coexistencia (Baileys + Cloud API hibrido)
- Window Subscribers com job de notificacao
- Templates ORDER_DETAILS com auto variaveis
- Automacoes com template routing Atlaz
- Rate limiter, API Docs, melhorias gerais

### v2.1.12
- ORDER_DETAILS templates e auto variaveis
- Melhorias Atlaz

### v2.1.11
- Otimizacao Baileys e botao reiniciar
- Deteccao de conflito Typebot vs Flow

### v2.1.9
- Sistema de atualizacao automatica com SSE

---

## Versao Premium

A versao premium inclui recursos avancados para empresas que precisam de mais robustez e integracoes:

### Redundancia de Conexao
- **3 bibliotecas de conexao WhatsApp** para garantir estabilidade
- Failover automatico entre libs
- Reconexao inteligente sem perda de mensagens

### Integracoes Adicionais
- **Telegram** - Envie e receba mensagens do Telegram
- **Facebook Messenger** - Integrado com paginas do Facebook
- **MercadoLivre** - Notificacoes de vendas e perguntas
- **Mercado Pago** - Webhooks de pagamentos e cobrancas

### Recursos Extras
- Suporte prioritario
- Instalacao assistida
- Atualizacoes antecipadas
- Dashboard analytics avancado

**Interessado na versao premium? Entre em contato!**

---

## Contribua

Se este projeto te ajudou, considere fazer uma contribuicao:

**Pix:** `21974095194`

**WhatsApp:** [21 97409-5194](https://wa.me/5521974095194)

Sua contribuicao ajuda a manter o projeto ativo e com novas funcionalidades!

---

## Licenca

MIT License
