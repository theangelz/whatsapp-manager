# WhatsApp Manager API

Sistema completo de gerenciamento de WhatsApp com suporte a Baileys (QR Code) e Meta Cloud API.

## Funcionalidades

- Multi-instancias (varios numeros WhatsApp)
- Suporte a Baileys (conexao via QR Code)
- Suporte a Meta Cloud API (WhatsApp Business)
- FlowBuilder visual para criar chatbots
- Integracoes com Typebot e n8n
- Webhooks personalizados
- Painel administrativo
- API REST completa

## Requisitos

- Ubuntu 20.04+ ou Debian 11+
- 2GB RAM minimo (4GB recomendado)
- 20GB de disco
- Dominio apontando para o servidor
- Portas 80 e 443 abertas

## Instalacao Rapida

```bash
# Clonar repositorio
git clone https://github.com/seu-usuario/whatsapp-manager.git
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
# Iniciar PostgreSQL com Docker
docker run -d \
  --name whatsapp_postgres \
  -e POSTGRES_USER=whatsapp \
  -e POSTGRES_PASSWORD=sua_senha \
  -e POSTGRES_DB=whatsapp_manager \
  -p 5432:5432 \
  postgres:15-alpine
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
# Backend
cd backend
pm2 start dist/server.js --name whatsapp-backend

# Frontend
cd frontend
npm install -g serve
pm2 start "serve -s dist -l 5454" --name whatsapp-frontend

pm2 save
pm2 startup
```

## Variaveis de Ambiente

### Backend (.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_manager"
JWT_SECRET="seu_jwt_secret_muito_seguro"
PORT=3333
NODE_ENV=production
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
├── backend/           # API Node.js + Fastify
│   ├── src/
│   │   ├── config/    # Configuracoes
│   │   ├── middlewares/
│   │   ├── modules/   # Modulos da API
│   │   └── providers/ # Baileys, Cloud API
│   └── prisma/        # Schema do banco
├── frontend/          # React + Vite
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
└── install.sh         # Instalador automatico
```

## API Endpoints Principais

### Autenticacao
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login

### Instancias
- `GET /api/instances` - Listar instancias
- `POST /api/instances` - Criar instancia
- `POST /api/instances/:id/connect` - Conectar (gerar QR)
- `POST /api/instances/:id/disconnect` - Desconectar

### Mensagens
- `POST /api/messages/:instanceId/send` - Enviar mensagem
- `POST /api/messages/:instanceId/send-template` - Enviar template

### Fluxos (Chatbot)
- `GET /api/flows` - Listar fluxos
- `POST /api/flows` - Criar fluxo
- `PUT /api/flows/:id/canvas` - Salvar canvas

### Webhooks
- `GET /api/webhook/cloud-api/:instanceId` - Verificacao Meta
- `POST /api/webhook/cloud-api/:instanceId` - Eventos Meta

## Comandos Uteis

```bash
# Ver logs
pm2 logs whatsapp-backend
pm2 logs whatsapp-frontend

# Reiniciar
pm2 restart all

# Status
pm2 status

# Rebuild
cd backend && npm run build
cd frontend && npm run build
pm2 restart all
```

## Suporte

Para suporte, abra uma issue no GitHub ou entre em contato.

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

Sua contribuicao ajuda a manter o projeto ativo e com novas funcionalidades!

---

## Licenca

MIT License
