#!/bin/bash

# Script para diagnosticar problemas de conexão com MySQL
# Uso: ./check_mysql.sh

echo "🔍 Verificando MySQL..."
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Carregar variáveis do .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✅ Arquivo .env encontrado${NC}"
else
    echo -e "${RED}❌ Arquivo .env não encontrado!${NC}"
    exit 1
fi

echo ""
echo "📋 Configurações do .env:"
echo "   DB_HOST: $DB_HOST"
echo "   DB_PORT: $DB_PORT"
echo "   DB_USER: $DB_USER"
echo "   DB_NAME: $DB_NAME"
echo ""

# Verificar se MySQL está instalado localmente
echo "🔧 Verificando instalação do MySQL..."
if command -v mysql &> /dev/null; then
    echo -e "${GREEN}✅ MySQL client instalado${NC}"
    mysql --version
else
    echo -e "${YELLOW}⚠️  MySQL client não está instalado localmente${NC}"
    echo "   Instalando: apt-get install mysql-client"
fi

echo ""

# Verificar se MySQL está rodando como serviço
echo "🔧 Verificando serviço MySQL local..."
if systemctl is-active --quiet mysql; then
    echo -e "${GREEN}✅ Serviço MySQL está rodando${NC}"
    systemctl status mysql --no-pager | head -n 5
elif systemctl is-active --quiet mysqld; then
    echo -e "${GREEN}✅ Serviço mysqld está rodando${NC}"
    systemctl status mysqld --no-pager | head -n 5
else
    echo -e "${YELLOW}⚠️  Serviço MySQL não está rodando localmente${NC}"
fi

echo ""

# Verificar containers Docker com MySQL
echo "🐳 Verificando containers Docker com MySQL..."
mysql_containers=$(docker ps --filter "ancestor=mysql" --format "{{.Names}}" 2>/dev/null)
if [ ! -z "$mysql_containers" ]; then
    echo -e "${GREEN}✅ Containers MySQL encontrados:${NC}"
    docker ps --filter "ancestor=mysql" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    echo ""
    echo "💡 Para importar o schema via Docker:"
    for container in $mysql_containers; do
        echo "   docker exec -i $container mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database_schema.sql"
    done
else
    echo -e "${YELLOW}⚠️  Nenhum container MySQL rodando${NC}"
fi

echo ""

# Testar conexão TCP
echo "🌐 Testando conexão TCP com ${DB_HOST}:${DB_PORT}..."
if command -v nc &> /dev/null; then
    if nc -z -w5 $DB_HOST $DB_PORT 2>/dev/null; then
        echo -e "${GREEN}✅ Porta $DB_PORT está acessível em $DB_HOST${NC}"
    else
        echo -e "${RED}❌ Não foi possível conectar na porta $DB_PORT em $DB_HOST${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  netcat (nc) não está instalado. Pulando teste de porta.${NC}"
fi

echo ""

# Tentar conexão real com MySQL
echo "🔐 Testando autenticação MySQL..."

if [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
    # Tentativa local
    if command -v mysql &> /dev/null; then
        if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "SHOW DATABASES;" &>/dev/null; then
            echo -e "${GREEN}✅ Conexão MySQL bem-sucedida!${NC}"
            echo ""
            echo "📊 Databases disponíveis:"
            mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "SHOW DATABASES;" 2>/dev/null

            # Verificar se database veterinaria existe
            if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME;" &>/dev/null; then
                echo ""
                echo -e "${GREEN}✅ Database '$DB_NAME' existe!${NC}"
                echo ""
                echo "📋 Tabelas existentes:"
                mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW TABLES;" 2>/dev/null
            else
                echo ""
                echo -e "${YELLOW}⚠️  Database '$DB_NAME' não existe!${NC}"
                echo "   Criando database..."
                mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
                echo -e "${GREEN}✅ Database criada!${NC}"
            fi
        else
            echo -e "${RED}❌ Falha na autenticação MySQL${NC}"
            echo "   Verifique as credenciais no .env"
        fi
    else
        echo -e "${RED}❌ Cliente MySQL não disponível${NC}"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 RESUMO E PRÓXIMOS PASSOS:"
echo ""

if systemctl is-active --quiet mysql || systemctl is-active --quiet mysqld; then
    echo -e "${GREEN}✅ MySQL está rodando localmente${NC}"
    echo "   Execute: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database_schema.sql"
elif [ ! -z "$mysql_containers" ]; then
    echo -e "${GREEN}✅ MySQL está rodando em Docker${NC}"
    echo "   Execute: docker exec -i <container> mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < database_schema.sql"
else
    echo -e "${RED}❌ MySQL não encontrado!${NC}"
    echo ""
    echo "Opções:"
    echo "1. Instalar MySQL localmente:"
    echo "   apt-get update && apt-get install mysql-server"
    echo ""
    echo "2. Usar Docker Compose com MySQL incluído:"
    echo "   docker-compose -f docker-compose.dev.yml up -d"
    echo ""
    echo "3. Conectar a um MySQL remoto:"
    echo "   Altere DB_HOST no .env para o IP do servidor MySQL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
