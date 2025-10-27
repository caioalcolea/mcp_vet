#!/bin/bash

# Script para testar jobs manualmente
# Uso: ./test_jobs.sh [job_name]
# Exemplo: ./test_jobs.sh vaccines

set -e

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

BASE_URL="http://localhost:2080"

# Função para testar um job
test_job() {
    local job_name=$1
    echo -e "${YELLOW}🧪 Testando job: ${job_name}${NC}"

    response=$(curl -s -X POST "${BASE_URL}/jobs/${job_name}/run")

    if echo "$response" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ Job ${job_name} executado com sucesso!${NC}"
        echo "$response" | jq '.'
    else
        echo -e "${RED}❌ Erro ao executar job ${job_name}${NC}"
        echo "$response" | jq '.'
        return 1
    fi

    echo ""
}

# Verificar se jq está instalado
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq não está instalado. Instalando...${NC}"
    echo "Os resultados serão mostrados sem formatação."
fi

# Verificar se o serviço está rodando
if ! curl -f "${BASE_URL}/health" &> /dev/null; then
    echo -e "${RED}❌ Serviço não está respondendo em ${BASE_URL}${NC}"
    echo "Certifique-se de que o bot está rodando com: docker-compose up -d"
    exit 1
fi

echo -e "${GREEN}✅ Serviço está rodando${NC}"
echo ""

# Se um job específico foi passado, executa apenas ele
if [ $# -eq 1 ]; then
    test_job "$1"
    exit 0
fi

# Caso contrário, menu interativo
echo "Selecione o job para testar:"
echo "1) vaccines      - Reativação de vacinas"
echo "2) financial     - Reativação financeira"
echo "3) grooming      - Reativação de banhos"
echo "4) appointments  - Confirmação de consultas"
echo "5) satisfaction  - Pesquisa de satisfação"
echo "6) all           - Executar todos os jobs"
echo "0) Sair"
echo ""

read -p "Opção: " option

case $option in
    1)
        test_job "vaccines"
        ;;
    2)
        test_job "financial"
        ;;
    3)
        test_job "grooming"
        ;;
    4)
        test_job "appointments"
        ;;
    5)
        test_job "satisfaction"
        ;;
    6)
        echo -e "${YELLOW}🧪 Executando todos os jobs...${NC}"
        echo ""
        test_job "vaccines"
        test_job "financial"
        test_job "grooming"
        test_job "appointments"
        test_job "satisfaction"
        echo -e "${GREEN}✅ Todos os jobs foram executados!${NC}"
        ;;
    0)
        echo "Saindo..."
        exit 0
        ;;
    *)
        echo -e "${RED}Opção inválida!${NC}"
        exit 1
        ;;
esac
