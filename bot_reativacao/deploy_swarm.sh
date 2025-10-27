#!/bin/bash

# Script de deploy do Bot de Reativação para Docker Swarm
# Uso: ./deploy_swarm.sh

set -e

echo "🚀 Iniciando deploy do Bot de Reativação (Docker Swarm)..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Nome do stack
STACK_NAME="reativa_bicho_solto"
IMAGE_NAME="bot-reativacao-vet:latest"

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

# Verificar se está em modo Swarm
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
    echo -e "${RED}❌ Docker não está em modo Swarm!${NC}"
    echo "Inicialize o Swarm com: docker swarm init"
    exit 1
fi

echo -e "${GREEN}✅ Docker Swarm ativo${NC}"

# Verificar se a rede talkhub existe
if ! docker network inspect talkhub &> /dev/null; then
    echo -e "${YELLOW}⚠️  Rede talkhub não encontrada. Criando...${NC}"
    docker network create --driver=overlay talkhub
    echo -e "${GREEN}✅ Rede talkhub criada${NC}"
else
    echo -e "${GREEN}✅ Rede talkhub existe${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ETAPA 1: BUILD DA IMAGEM DOCKER${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}🔨 Construindo imagem Docker...${NC}"
docker build -t $IMAGE_NAME .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Imagem construída com sucesso!${NC}"
else
    echo -e "${RED}❌ Falha no build da imagem!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ETAPA 2: DEPLOY NO SWARM${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Verificar se stack já existe
if docker stack ls --format "{{.Name}}" | grep -q "^${STACK_NAME}$"; then
    echo -e "${YELLOW}⚠️  Stack '$STACK_NAME' já existe. Atualizando...${NC}"
else
    echo -e "${YELLOW}🆕 Criando nova stack '$STACK_NAME'...${NC}"
fi

# Deploy do stack
docker stack deploy -c docker-compose.yml $STACK_NAME

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Stack deployed com sucesso!${NC}"
else
    echo -e "${RED}❌ Falha no deploy do stack!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ETAPA 3: VERIFICAÇÃO${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}⏳ Aguardando serviço inicializar (15 segundos)...${NC}"
sleep 15

# Mostrar status dos serviços
echo ""
echo -e "${GREEN}📊 Status do stack:${NC}"
docker stack ps $STACK_NAME --no-trunc

echo ""
echo -e "${GREEN}📋 Serviços do stack:${NC}"
docker stack services $STACK_NAME

# Verificar health do serviço
echo ""
echo -e "${YELLOW}🏥 Aguardando health check (mais 20 segundos)...${NC}"
sleep 20

SERVICE_NAME="${STACK_NAME}_bot-reativacao"
TASK_STATE=$(docker service ps $SERVICE_NAME --format "{{.CurrentState}}" | head -n 1)

if echo "$TASK_STATE" | grep -q "Running"; then
    echo -e "${GREEN}✅ Serviço está rodando!${NC}"

    # Tentar acessar health endpoint
    if curl -f -s http://localhost:2080/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Health check passou!${NC}"
    else
        echo -e "${YELLOW}⚠️  Health endpoint não respondeu ainda (pode estar inicializando)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Serviço ainda não está em 'Running'. Estado atual: $TASK_STATE${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  DEPLOY CONCLUÍDO!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${GREEN}✨ Bot de Reativação deployed em Docker Swarm!${NC}"
echo ""
echo "📝 Comandos úteis:"
echo ""
echo "  Ver logs:"
echo "    docker service logs -f ${SERVICE_NAME}"
echo ""
echo "  Ver status:"
echo "    docker stack ps ${STACK_NAME}"
echo ""
echo "  Atualizar (após mudanças):"
echo "    ./deploy_swarm.sh"
echo ""
echo "  Remover stack:"
echo "    docker stack rm ${STACK_NAME}"
echo ""
echo "  Escalar serviço:"
echo "    docker service scale ${SERVICE_NAME}=2"
echo ""
echo "🌐 Endpoints:"
echo "  Health: https://automacaobs.talkhub.me/health"
echo "  Status: https://automacaobs.talkhub.me/status"
echo ""
echo -e "${GREEN}✅ Deploy finalizado!${NC}"
