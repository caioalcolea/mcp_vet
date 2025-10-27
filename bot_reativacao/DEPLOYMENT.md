# Guia Rápido de Deploy - Bot de Reativação

## Pré-requisitos

1. VPS com Ubuntu 20.04+ ou similar
2. Docker e Docker Compose instalados
3. Traefik rodando em modo Swarm
4. Domínio `automacaobs.talkhub.me` apontando para o servidor
5. MySQL instalado e configurado
6. Credenciais da API TalkHub (WhatsApp)

## Passo a Passo

### 1. Preparar o Banco de Dados

```bash
# Conectar ao MySQL
mysql -u root -p

# Criar banco de dados (se não existir)
CREATE DATABASE IF NOT EXISTS veterinaria CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Importar schema
mysql -u root -p veterinaria < database_schema.sql

# Verificar tabelas
mysql -u root -p veterinaria -e "SHOW TABLES;"
```

### 2. Configurar Variáveis de Ambiente

```bash
# Copiar exemplo
cp .env.example .env

# Editar configurações
nano .env
```

Variáveis obrigatórias:
```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=veterinaria

# WhatsApp API
WHATSAPP_API_URL=https://api.talkhub.me
WHATSAPP_API_TOKEN=seu_token_aqui
WHATSAPP_INSTANCE_ID=sua_instancia_aqui

# Formulários
FORM_BANHO_SEM_TAXIDOG=https://form.talkhub.me/s/jlhjnwu8g1wumfddpdc0nilp
FORM_BANHO_COM_TAXIDOG=https://form.talkhub.me/s/sh6ead0tdtot8avbivitrygw
FORM_BANHO_TOSA_COM_TAXIDOG=https://form.talkhub.me/s/lt4e0a8q7pkrdn0u9dhuy2jv
FORM_BANHO_TOSA_SEM_TAXIDOG=https://form.talkhub.me/s/cmgidazc6001hr740cj2c912l
GOOGLE_REVIEW_URL=https://g.page/r/sua_clinica/review
```

### 3. Verificar Rede Traefik

```bash
# Verificar se a rede traefik-public existe
docker network ls | grep traefik-public

# Se não existir, criar
docker network create traefik-public
```

### 4. Deploy com Docker Compose (Modo Normal)

```bash
# Executar script de deploy
./deploy.sh

# OU manualmente:
docker-compose up -d

# Verificar logs
docker-compose logs -f
```

### 5. Deploy com Docker Swarm (Recomendado)

```bash
# Build da imagem
docker-compose build

# Deploy no Swarm
docker stack deploy -c docker-compose.yml bot-reativacao

# Verificar serviços
docker service ls | grep bot-reativacao

# Ver logs
docker service logs -f bot-reativacao_bot-reativacao
```

### 6. Verificar Deployment

```bash
# Health check local
curl http://localhost:2080/health

# Health check produção
curl https://automacaobs.talkhub.me/health

# Status dos jobs
curl https://automacaobs.talkhub.me/status
```

## Testes

### Testar Jobs Manualmente

```bash
# Usar script de teste
./test_jobs.sh

# OU testar job específico
curl -X POST https://automacaobs.talkhub.me/jobs/vaccines/run
curl -X POST https://automacaobs.talkhub.me/jobs/financial/run
curl -X POST https://automacaobs.talkhub.me/jobs/grooming/run
curl -X POST https://automacaobs.talkhub.me/jobs/appointments/run
curl -X POST https://automacaobs.talkhub.me/jobs/satisfaction/run
```

### Verificar Logs

```bash
# Docker Compose
docker-compose logs -f

# Docker Swarm
docker service logs -f bot-reativacao_bot-reativacao

# Logs dentro do container
docker exec -it bot-reativacao tail -f logs/combined.log
```

## Monitoramento

### Health Checks

O Traefik verifica automaticamente a saúde do serviço via:
- Endpoint: `/health`
- Intervalo: 30 segundos
- Timeout: 10 segundos

### Logs de Reativação

Todos os envios são registrados na tabela `reactivation_logs`:

```sql
SELECT
    reactivation_type,
    COUNT(*) as total,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as sucessos,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as erros
FROM reactivation_logs
WHERE DATE(sent_at) = CURDATE()
GROUP BY reactivation_type;
```

## Atualização

```bash
# Parar serviço
docker-compose down
# OU
docker stack rm bot-reativacao

# Atualizar código
git pull

# Rebuild e deploy
./deploy.sh
# OU
docker stack deploy -c docker-compose.yml bot-reativacao
```

## Troubleshooting

### Problema: Serviço não inicia

```bash
# Verificar logs
docker-compose logs

# Verificar configurações
docker-compose config

# Verificar conexão com banco
docker-compose exec bot-reativacao nc -zv $DB_HOST $DB_PORT
```

### Problema: Mensagens não são enviadas

```bash
# Verificar logs
docker-compose logs | grep -i error

# Testar API TalkHub manualmente
curl -H "Authorization: Bearer $WHATSAPP_API_TOKEN" \
  https://api.talkhub.me/status

# Executar job manualmente para debug
curl -X POST http://localhost:2080/jobs/vaccines/run
```

### Problema: Jobs não executam no horário

```bash
# Verificar status dos jobs
curl http://localhost:2080/status

# Verificar configuração de timezone no container
docker exec bot-reativacao date

# Ajustar timezone se necessário (adicionar ao docker-compose.yml)
environment:
  - TZ=America/Sao_Paulo
```

## Backup

### Backup do Banco de Dados

```bash
# Backup diário
mysqldump -u root -p veterinaria > backup_$(date +%Y%m%d).sql

# Backup de logs
tar -czf logs_backup_$(date +%Y%m%d).tar.gz bot_reativacao/logs/
```

## Segurança

1. **Não commitar o arquivo `.env`** - Ele contém credenciais sensíveis
2. **Usar HTTPS apenas** - Configurado automaticamente pelo Traefik
3. **Revisar logs regularmente** - Verificar tentativas de acesso não autorizado
4. **Manter senhas fortes** - Para banco de dados e API

## Suporte

Para problemas, verificar:
1. Logs em `logs/error.log`
2. Documentação do TalkHub
3. Status dos serviços: `docker service ps bot-reativacao_bot-reativacao`

## URLs Importantes

- Produção: https://automacaobs.talkhub.me
- Health Check: https://automacaobs.talkhub.me/health
- Status: https://automacaobs.talkhub.me/status
- API TalkHub: https://api.talkhub.me
