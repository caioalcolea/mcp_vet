#!/bin/bash

echo "🔄 Aplicando migração de colunas faltantes..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Encontrar o container do PostgreSQL
POSTGRES_CONTAINER=$(docker ps --filter "name=postgres_postgres" --format "{{.Names}}" | head -n 1)

if [ -z "$POSTGRES_CONTAINER" ]; then
    echo -e "${RED}❌ Container PostgreSQL não encontrado!${NC}"
    echo "Procure manualmente: docker ps | grep postgres"
    exit 1
fi

echo -e "${GREEN}✅ Container PostgreSQL encontrado: $POSTGRES_CONTAINER${NC}"

# Aplicar migração
echo -e "${YELLOW}📋 Adicionando colunas faltantes...${NC}"
docker exec -i $POSTGRES_CONTAINER psql -U supabase_admin -d bot_reativacao_vet < add_missing_columns.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migração aplicada com sucesso!${NC}"

    # Verificar estrutura da tabela customers
    echo -e "${YELLOW}📊 Verificando estrutura da tabela customers:${NC}"
    docker exec -i $POSTGRES_CONTAINER psql -U supabase_admin -d bot_reativacao_vet -c "\d customers"

    echo ""
    echo -e "${GREEN}🎉 Migration completa!${NC}"
    echo ""
    echo "Agora você pode executar o sync do VetCare novamente."
else
    echo -e "${RED}❌ Erro ao aplicar migração!${NC}"
    exit 1
fi
