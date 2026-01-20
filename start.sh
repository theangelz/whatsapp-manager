#!/bin/bash

echo "=========================================="
echo "  WhatsApp Manager - Setup & Start"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Start PostgreSQL and Redis
echo -e "\n${GREEN}Starting PostgreSQL and Redis...${NC}"
docker-compose up -d

# Wait for services
echo "Waiting for services to be ready..."
sleep 5

# Setup Backend
echo -e "\n${GREEN}Setting up Backend...${NC}"
cd backend

if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run migrations
echo "Running database migrations..."
npx prisma migrate dev --name init

cd ..

# Setup Frontend
echo -e "\n${GREEN}Setting up Frontend...${NC}"
cd frontend

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

cd ..

echo -e "\n${GREEN}=========================================="
echo "  Setup Complete!"
echo "==========================================${NC}"
echo ""
echo "To start the application:"
echo ""
echo "  1. Backend (Terminal 1):"
echo "     cd backend && npm run dev"
echo ""
echo "  2. Frontend (Terminal 2):"
echo "     cd frontend && npm run dev"
echo ""
echo "  Access the application at:"
echo "     http://localhost:5454"
echo ""
echo "  API runs at:"
echo "     http://localhost:3333"
echo ""
