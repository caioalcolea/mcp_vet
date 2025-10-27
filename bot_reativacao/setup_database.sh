#!/bin/bash

echo "🗄️  Configurando banco de dados bot_reativacao_vet..."

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

# Criar banco de dados se não existir
echo -e "${YELLOW}📦 Criando banco de dados bot_reativacao_vet...${NC}"
docker exec -i $POSTGRES_CONTAINER psql -U postgres -c "CREATE DATABASE bot_reativacao_vet;" 2>/dev/null || echo "Banco já existe (OK)"

# Criar usuário supabase_admin se não existir
echo -e "${YELLOW}👤 Configurando usuário supabase_admin...${NC}"
docker exec -i $POSTGRES_CONTAINER psql -U postgres -c "CREATE USER supabase_admin WITH PASSWORD '16bc41eb37268783dd01221d9a147372';" 2>/dev/null || echo "Usuário já existe (OK)"

# Dar permissões ao usuário
echo -e "${YELLOW}🔑 Configurando permissões...${NC}"
docker exec -i $POSTGRES_CONTAINER psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE bot_reativacao_vet TO supabase_admin;"
docker exec -i $POSTGRES_CONTAINER psql -U postgres -d bot_reativacao_vet -c "GRANT ALL ON SCHEMA public TO supabase_admin;"

# Executar schema SQL
echo -e "${YELLOW}📋 Criando tabelas...${NC}"
docker exec -i $POSTGRES_CONTAINER psql -U postgres -d bot_reativacao_vet < database_schema_postgres.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Banco de dados configurado com sucesso!${NC}"

    # Verificar tabelas criadas
    echo -e "${YELLOW}📊 Verificando tabelas criadas...${NC}"
    docker exec -i $POSTGRES_CONTAINER psql -U postgres -d bot_reativacao_vet -c "\dt"

    echo ""
    echo -e "${GREEN}🎉 Setup completo!${NC}"
    echo ""
    echo "Você pode testar a conexão com:"
    echo "docker exec -it $POSTGRES_CONTAINER psql -U supabase_admin -d bot_reativacao_vet"
else
    echo -e "${RED}❌ Erro ao criar tabelas!${NC}"
    exit 1
fi
