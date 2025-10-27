#!/bin/bash

# Script de deploy do Bot de Reativação
# Uso: ./deploy.sh

set -e

echo "🚀 Iniciando deploy do Bot de Reativação..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se .env existe
if [ ! -f .env ]; then
    echo -e "${RED}❌ Arquivo .env não encontrado!${NC}"
    echo "Por favor, copie .env.example para .env e configure as variáveis."
    exit 1
fi

echo -e "${GREEN}✅ Arquivo .env encontrado${NC}"

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker não está instalado!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker instalado${NC}"

# Verificar se Docker Compose está instalado
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose não está instalado!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker Compose instalado${NC}"

# Verificar se a rede traefik-public existe
if ! docker network inspect traefik-public &> /dev/null; then
    echo -e "${YELLOW}⚠️  Rede traefik-public não encontrada. Criando...${NC}"
    docker network create traefik-public
    echo -e "${GREEN}✅ Rede traefik-public criada${NC}"
else
    echo -e "${GREEN}✅ Rede traefik-public existe${NC}"
fi

# Parar containers antigos se existirem
echo -e "${YELLOW}🛑 Parando containers antigos...${NC}"
docker-compose down || true

# Build da imagem
echo -e "${YELLOW}🔨 Construindo imagem Docker...${NC}"
docker-compose build --no-cache

# Subir o serviço
echo -e "${YELLOW}🚀 Iniciando serviço...${NC}"
docker-compose up -d

# Aguardar serviço ficar saudável
echo -e "${YELLOW}⏳ Aguardando serviço ficar saudável...${NC}"
sleep 10

# Verificar health
if curl -f http://localhost:2080/health &> /dev/null; then
    echo -e "${GREEN}✅ Serviço está saudável!${NC}"
else
    echo -e "${RED}❌ Serviço não está respondendo!${NC}"
    echo "Logs:"
    docker-compose logs --tail=50
    exit 1
fi

# Mostrar status
echo ""
echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo ""
echo "📊 Status do serviço:"
docker-compose ps

echo ""
echo "📝 Ver logs:"
echo "   docker-compose logs -f"

echo ""
echo "🌐 Endpoints:"
echo "   Health: http://localhost:2080/health"
echo "   Status: http://localhost:2080/status"
echo "   Produção: https://automacaobs.talkhub.me"

echo ""
echo -e "${GREEN}✨ Bot de Reativação está rodando!${NC}"
