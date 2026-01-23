#!/bin/bash

#############################################
# WhatsApp Manager API - Instalador Automatico
# Desenvolvido por SJNetwork
#############################################

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funcoes de log
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
log_error() { echo -e "${RED}[ERRO]${NC} $1"; }

# Banner
echo ""
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║     WhatsApp Manager API - Instalador Automatico          ║"
echo "║                      v2.1.11                              ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Verificar se esta rodando como root
if [ "$EUID" -ne 0 ]; then
  log_error "Por favor, execute como root (sudo ./install.sh)"
  exit 1
fi

# Diretorio atual (onde o script foi clonado)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Verificar se backend e frontend existem
if [ ! -d "$SCRIPT_DIR/backend" ] || [ ! -d "$SCRIPT_DIR/frontend" ]; then
  log_error "Diretorio backend ou frontend nao encontrado!"
  log_error "Certifique-se de executar o script da pasta do projeto clonado."
  exit 1
fi

# Usar diretorio atual como APP_DIR
APP_DIR="$SCRIPT_DIR"
log_info "Diretorio do projeto: $APP_DIR"

# Coletar informacoes
echo -e "${YELLOW}=== Configuracao Inicial ===${NC}"
echo ""

read -p "Digite o dominio da API (ex: api.seudominio.com.br): " DOMAIN
read -p "Digite a porta do backend [3333]: " PORT
PORT=${PORT:-3333}
read -p "Digite a porta do frontend [5454]: " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-5454}

# Gerar senhas aleatorias
DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64)

echo ""
log_info "Dominio: $DOMAIN"
log_info "Porta Backend: $PORT"
log_info "Porta Frontend: $FRONTEND_PORT"
echo ""

read -p "Confirma as configuracoes? (s/n): " CONFIRM
if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
  log_warning "Instalacao cancelada."
  exit 0
fi

echo ""
log_info "Iniciando instalacao..."
echo ""

# Atualizar sistema
log_info "Atualizando sistema..."
apt-get update -qq
apt-get upgrade -y -qq
log_success "Sistema atualizado"

# Instalar dependencias basicas
log_info "Instalando dependencias basicas..."
apt-get install -y -qq curl wget git build-essential ca-certificates gnupg lsb-release ufw
log_success "Dependencias basicas instaladas"

# Instalar Docker
if ! command -v docker &> /dev/null; then
  log_info "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log_success "Docker instalado"
else
  log_success "Docker ja instalado"
fi

# Instalar Node.js 20
if ! command -v node &> /dev/null; then
  log_info "Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  log_success "Node.js instalado: $(node -v)"
else
  log_success "Node.js ja instalado: $(node -v)"
fi

# Instalar PM2
if ! command -v pm2 &> /dev/null; then
  log_info "Instalando PM2..."
  npm install -g pm2 -q
  log_success "PM2 instalado"
else
  log_success "PM2 ja instalado"
fi

# Criar arquivo .env do backend
log_info "Configurando variaveis de ambiente..."
cat > $APP_DIR/backend/.env << EOF
# Database
DATABASE_URL="postgresql://whatsapp:${DB_PASSWORD}@localhost:5432/whatsapp_manager?schema=public"

# JWT
JWT_SECRET="${JWT_SECRET}"

# Server
PORT=${PORT}
NODE_ENV=production
BACKEND_URL=https://${DOMAIN}
FRONTEND_URL=https://${DOMAIN}

# Baileys Sessions
BAILEYS_SESSIONS_PATH="./sessions"

# Meta Cloud API (opcional)
META_WEBHOOK_VERIFY_TOKEN=

# Typebot (opcional)
TYPEBOT_API_KEY=
EOF

# Criar arquivo .env do frontend
cat > $APP_DIR/frontend/.env << EOF
VITE_API_URL=https://${DOMAIN}
EOF

log_success "Variaveis de ambiente configuradas"

# Criar diretorios necessarios
mkdir -p $APP_DIR/backend/sessions
mkdir -p $APP_DIR/backend/uploads

# Iniciar PostgreSQL com Docker
log_info "Iniciando PostgreSQL com Docker..."
docker stop whatsapp_postgres 2>/dev/null || true
docker rm whatsapp_postgres 2>/dev/null || true

docker run -d \
  --name whatsapp_postgres \
  --restart always \
  -e POSTGRES_USER=whatsapp \
  -e POSTGRES_PASSWORD=${DB_PASSWORD} \
  -e POSTGRES_DB=whatsapp_manager \
  -p 5432:5432 \
  -v whatsapp_postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine

log_success "PostgreSQL iniciado"

# Iniciar Redis com Docker
log_info "Iniciando Redis com Docker..."
docker stop whatsapp_redis 2>/dev/null || true
docker rm whatsapp_redis 2>/dev/null || true

docker run -d \
  --name whatsapp_redis \
  --restart always \
  -p 6379:6379 \
  redis:7-alpine

log_success "Redis iniciado"

# Aguardar PostgreSQL estar pronto
log_info "Aguardando PostgreSQL estar pronto..."
for i in {1..30}; do
  if docker exec whatsapp_postgres pg_isready -U whatsapp > /dev/null 2>&1; then
    log_success "PostgreSQL esta pronto"
    break
  fi
  sleep 1
done

# Instalar dependencias do backend (inclui dev para typescript)
log_info "Instalando dependencias do backend..."
cd $APP_DIR/backend
npm install --include=dev
log_success "Dependencias do backend instaladas"

# Gerar Prisma Client e sincronizar banco de dados
log_info "Configurando banco de dados..."
npx prisma generate
npx prisma db push --accept-data-loss
log_success "Banco de dados configurado"

# Criar usuario admin
log_info "Criando usuario administrador..."
npx prisma db seed || true
log_success "Usuario admin criado"

# Buildar backend
log_info "Buildando backend..."
npm run build
npx prisma generate
log_success "Backend buildado"

# Instalar dependencias do frontend (inclui dev para typescript)
log_info "Instalando dependencias do frontend..."
cd $APP_DIR/frontend
npm install --include=dev
log_success "Dependencias do frontend instaladas"

# Buildar frontend
log_info "Buildando frontend..."
npm run build
log_success "Frontend buildado"

# Instalar serve para servir frontend
npm install -g serve

# Parar processos PM2 existentes e liberar portas
pm2 delete whatsapp-backend 2>/dev/null || true
pm2 delete whatsapp-frontend 2>/dev/null || true
fuser -k ${PORT}/tcp 2>/dev/null || true
fuser -k ${FRONTEND_PORT}/tcp 2>/dev/null || true
sleep 2

# Iniciar backend com PM2
log_info "Iniciando backend com PM2..."
cd $APP_DIR/backend
pm2 start dist/server.js --name whatsapp-backend
log_success "Backend iniciado na porta ${PORT}"

# Iniciar frontend com PM2
log_info "Iniciando frontend com PM2..."
cd $APP_DIR/frontend
pm2 start "serve -s dist -l ${FRONTEND_PORT}" --name whatsapp-frontend
log_success "Frontend iniciado na porta ${FRONTEND_PORT}"

# Salvar configuracao PM2
pm2 save
pm2 startup

# Configurar Firewall
log_info "Configurando Firewall..."
ufw allow 22/tcp
ufw allow ${PORT}/tcp
ufw allow ${FRONTEND_PORT}/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log_success "Firewall configurado"

echo ""
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║           INSTALACAO CONCLUIDA COM SUCESSO!               ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${YELLOW}=== Portas da Aplicacao ===${NC}"
echo ""
echo -e "Backend:            ${GREEN}http://IP_DO_SERVIDOR:${PORT}${NC}"
echo -e "Frontend:           ${GREEN}http://IP_DO_SERVIDOR:${FRONTEND_PORT}${NC}"
echo ""
echo -e "${YELLOW}=== Configuracao no Nginx Proxy Manager ===${NC}"
echo ""
echo -e "Frontend: Aponte ${GREEN}${DOMAIN}${NC} para ${GREEN}http://IP_INTERNO:${FRONTEND_PORT}${NC}"
echo -e "API:      Aponte ${GREEN}${DOMAIN}/api${NC} para ${GREEN}http://IP_INTERNO:${PORT}${NC}"
echo ""
echo -e "${YELLOW}=== Credenciais de Admin ===${NC}"
echo ""
echo -e "Email:              ${GREEN}admin@whatsapp.local${NC}"
echo -e "Senha:              ${GREEN}admin123${NC}"
echo ""
echo -e "${RED}IMPORTANTE: Troque a senha do admin apos o primeiro login!${NC}"
echo ""
echo -e "${YELLOW}=== Credenciais do Banco ===${NC}"
echo ""
echo -e "Host:               localhost:5432"
echo -e "Usuario:            whatsapp"
echo -e "Senha:              ${DB_PASSWORD}"
echo -e "Database:           whatsapp_manager"
echo ""
echo -e "${YELLOW}=== Comandos Uteis ===${NC}"
echo ""
echo -e "Ver logs backend:   ${BLUE}pm2 logs whatsapp-backend${NC}"
echo -e "Ver logs frontend:  ${BLUE}pm2 logs whatsapp-frontend${NC}"
echo -e "Reiniciar:          ${BLUE}pm2 restart all${NC}"
echo -e "Status:             ${BLUE}pm2 status${NC}"
echo ""
echo -e "${YELLOW}=== Webhooks ===${NC}"
echo ""
echo -e "Meta Cloud API:     ${GREEN}https://${DOMAIN}/api/webhook/cloud-api/{instanceId}${NC}"
echo -e "Webhook Entrada:    ${GREEN}https://${DOMAIN}/api/webhook-entrada/{companyId}${NC}"
echo ""
echo -e "${BLUE}O companyId pode ser obtido na pagina de Webhook Events apos login.${NC}"
echo ""

# Salvar credenciais
cat > $APP_DIR/credenciais.txt << EOF
=== WhatsApp Manager API - Credenciais ===

Dominio: ${DOMAIN}
Backend: http://localhost:${PORT}
Frontend: http://localhost:${FRONTEND_PORT}
URL Publica: https://${DOMAIN}

=== Admin ===
Email: admin@whatsapp.local
Senha: admin123

=== Banco de Dados ===
Host: localhost:5432
Usuario: whatsapp
Senha: ${DB_PASSWORD}
Database: whatsapp_manager

=== JWT ===
Secret: ${JWT_SECRET}

=== Webhooks ===
Meta Cloud API: https://${DOMAIN}/api/webhook/cloud-api/{instanceId}
Webhook Entrada: https://${DOMAIN}/api/webhook-entrada/{companyId}

Gerado em: $(date)
EOF

chmod 600 $APP_DIR/credenciais.txt
log_info "Credenciais salvas em: $APP_DIR/credenciais.txt"
echo ""
