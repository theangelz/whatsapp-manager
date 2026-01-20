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
echo "║                      v1.0.0                               ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Verificar se esta rodando como root
if [ "$EUID" -ne 0 ]; then
  log_error "Por favor, execute como root (sudo)"
  exit 1
fi

# Coletar informacoes
echo -e "${YELLOW}=== Configuracao Inicial ===${NC}"
echo ""

read -p "Digite o dominio da API (ex: api.seudominio.com.br): " DOMAIN
read -p "Digite seu email (para SSL): " EMAIL
read -p "Digite a porta do backend [3333]: " PORT
PORT=${PORT:-3333}
read -p "Digite a porta do frontend [5454]: " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-5454}

# Gerar senhas aleatorias
DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64)
ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 16)

echo ""
log_info "Dominio: $DOMAIN"
log_info "Email: $EMAIL"
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
apt-get install -y -qq curl wget git build-essential ca-certificates gnupg lsb-release
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

# Instalar Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  log_info "Instalando Docker Compose..."
  apt-get install -y -qq docker-compose-plugin
  log_success "Docker Compose instalado"
else
  log_success "Docker Compose ja instalado"
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

# Criar diretorio da aplicacao
APP_DIR="/opt/whatsapp-manager"
log_info "Criando diretorio da aplicacao em $APP_DIR..."
mkdir -p $APP_DIR
cd $APP_DIR

# Copiar arquivos (se estivermos no diretorio do projeto)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -d "$SCRIPT_DIR/backend" ] && [ -d "$SCRIPT_DIR/frontend" ]; then
  log_info "Copiando arquivos do projeto..."
  cp -r "$SCRIPT_DIR/backend" $APP_DIR/
  cp -r "$SCRIPT_DIR/frontend" $APP_DIR/
  cp -r "$SCRIPT_DIR/docker-compose.yml" $APP_DIR/ 2>/dev/null || true
  cp -r "$SCRIPT_DIR/docker-compose.prod.yml" $APP_DIR/ 2>/dev/null || true
  log_success "Arquivos copiados"
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

# Baileys Sessions
BAILEYS_SESSIONS_PATH="./sessions"

# Meta Cloud API (opcional)
META_WEBHOOK_VERIFY_TOKEN=

# Typebot (opcional)
TYPEBOT_API_KEY=
EOF

# Criar arquivo .env do frontend
cat > $APP_DIR/frontend/.env << EOF
VITE_API_URL=https://${DOMAIN}/api
EOF

log_success "Variaveis de ambiente configuradas"

# Criar docker-compose.prod.yml
log_info "Criando docker-compose de producao..."
cat > $APP_DIR/docker-compose.prod.yml << EOF
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: whatsapp_postgres
    restart: always
    environment:
      POSTGRES_USER: whatsapp
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: whatsapp_manager
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U whatsapp -d whatsapp_manager"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - whatsapp-net

  redis:
    image: redis:7-alpine
    container_name: whatsapp_redis
    restart: always
    volumes:
      - redis_data:/data
    networks:
      - whatsapp-net

  traefik:
    image: traefik:v3.1
    container_name: whatsapp_traefik
    restart: always
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
      - "--certificatesresolvers.leresolver.acme.httpchallenge=true"
      - "--certificatesresolvers.leresolver.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.leresolver.acme.email=${EMAIL}"
      - "--certificatesresolvers.leresolver.acme.storage=/acme.json"
      - "--api.dashboard=false"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./acme.json:/acme.json"
    networks:
      - whatsapp-net

  backend:
    image: node:20-alpine
    container_name: whatsapp_backend
    restart: always
    working_dir: /app
    command: sh -c "npm install && npx prisma migrate deploy && npm run build && npm start"
    environment:
      - DATABASE_URL=postgresql://whatsapp:${DB_PASSWORD}@postgres:5432/whatsapp_manager?schema=public
      - JWT_SECRET=${JWT_SECRET}
      - PORT=${PORT}
      - NODE_ENV=production
      - BAILEYS_SESSIONS_PATH=/app/sessions
    volumes:
      - ./backend:/app
      - backend_node_modules:/app/node_modules
      - sessions_data:/app/sessions
    depends_on:
      postgres:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.backend.rule=Host(\`${DOMAIN}\`) && PathPrefix(\`/api\`)"
      - "traefik.http.routers.backend.entrypoints=websecure"
      - "traefik.http.routers.backend.tls.certresolver=leresolver"
      - "traefik.http.services.backend.loadbalancer.server.port=${PORT}"
      - "traefik.http.middlewares.backend-strip.stripprefix.prefixes=/api"
      - "traefik.http.routers.backend.middlewares=backend-strip"
    networks:
      - whatsapp-net

  frontend:
    image: node:20-alpine
    container_name: whatsapp_frontend
    restart: always
    working_dir: /app
    command: sh -c "npm install && npm run build && npx serve -s dist -l ${FRONTEND_PORT}"
    environment:
      - VITE_API_URL=https://${DOMAIN}/api
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(\`${DOMAIN}\`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=leresolver"
      - "traefik.http.services.frontend.loadbalancer.server.port=${FRONTEND_PORT}"
    networks:
      - whatsapp-net

volumes:
  postgres_data:
  redis_data:
  sessions_data:
  backend_node_modules:
  frontend_node_modules:

networks:
  whatsapp-net:
    driver: bridge
EOF

log_success "docker-compose.prod.yml criado"

# Criar arquivo acme.json para certificados SSL
touch $APP_DIR/acme.json
chmod 600 $APP_DIR/acme.json

# Instalar dependencias e buildar
log_info "Instalando dependencias do backend..."
cd $APP_DIR/backend
npm install --quiet
log_success "Dependencias do backend instaladas"

log_info "Gerando Prisma Client..."
npx prisma generate
log_success "Prisma Client gerado"

log_info "Instalando dependencias do frontend..."
cd $APP_DIR/frontend
npm install --quiet
log_success "Dependencias do frontend instaladas"

# Buildar projetos
log_info "Buildando backend..."
cd $APP_DIR/backend
npm run build
log_success "Backend buildado"

log_info "Buildando frontend..."
cd $APP_DIR/frontend
npm run build
log_success "Frontend buildado"

# Iniciar com Docker Compose
log_info "Iniciando servicos com Docker..."
cd $APP_DIR
docker compose -f docker-compose.prod.yml up -d postgres redis

# Aguardar PostgreSQL
log_info "Aguardando PostgreSQL iniciar..."
sleep 10

# Rodar migrations
log_info "Executando migrations do banco de dados..."
cd $APP_DIR/backend
DATABASE_URL="postgresql://whatsapp:${DB_PASSWORD}@localhost:5432/whatsapp_manager?schema=public" npx prisma migrate deploy
log_success "Migrations executadas"

# Criar usuario admin
log_info "Criando usuario administrador..."
DATABASE_URL="postgresql://whatsapp:${DB_PASSWORD}@localhost:5432/whatsapp_manager?schema=public" npx prisma db seed || true
log_success "Usuario admin criado"

# Iniciar backend e frontend com PM2
log_info "Iniciando aplicacao com PM2..."
cd $APP_DIR/backend
pm2 delete whatsapp-backend 2>/dev/null || true
pm2 start dist/server.js --name whatsapp-backend

cd $APP_DIR/frontend
pm2 delete whatsapp-frontend 2>/dev/null || true
npm install -g serve
pm2 start "serve -s dist -l ${FRONTEND_PORT}" --name whatsapp-frontend

pm2 save
pm2 startup

# Iniciar Traefik
log_info "Iniciando Traefik para SSL..."
cd $APP_DIR
docker compose -f docker-compose.prod.yml up -d traefik

echo ""
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║           INSTALACAO CONCLUIDA COM SUCESSO!               ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${YELLOW}=== Informacoes de Acesso ===${NC}"
echo ""
echo -e "URL do Sistema:     ${GREEN}https://${DOMAIN}${NC}"
echo -e "URL da API:         ${GREEN}https://${DOMAIN}/api${NC}"
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
echo -e "Host:               localhost"
echo -e "Porta:              5432"
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
echo -e "${YELLOW}=== Webhook para Meta Cloud API ===${NC}"
echo ""
echo -e "URL:                ${GREEN}https://${DOMAIN}/api/webhook/cloud-api/{instanceId}${NC}"
echo ""

# Salvar informacoes em arquivo
cat > $APP_DIR/credenciais.txt << EOF
=== WhatsApp Manager API - Credenciais ===

URL do Sistema: https://${DOMAIN}
URL da API: https://${DOMAIN}/api

=== Admin ===
Email: admin@whatsapp.local
Senha: admin123

=== Banco de Dados ===
Host: localhost
Porta: 5432
Usuario: whatsapp
Senha: ${DB_PASSWORD}
Database: whatsapp_manager

=== JWT ===
Secret: ${JWT_SECRET}

Gerado em: $(date)
EOF

chmod 600 $APP_DIR/credenciais.txt
log_info "Credenciais salvas em: $APP_DIR/credenciais.txt"
echo ""
