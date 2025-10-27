# Setup Rápido - Servidor Real

## ✅ Suas credenciais PostgreSQL Supabase:

```env
DB_HOST=tasks.postgres_postgres     # Nome do serviço Swarm
DB_PORT=5432                        # Porta padrão PostgreSQL
DB_USER=supabase_admin
DB_PASSWORD=16bc41eb37268783dd01221d9a147372
DB_NAME=bot_reativacao_vet          # Novo database que vamos criar
```

**Container identificado**: `postgres_postgres.1.byodefogahamy9w9gwfvvsxdg`

## 🚀 Passo a Passo

### 1. Encontrar o container PostgreSQL do Supabase

```bash
# Listar containers Postgres
docker ps | grep postgres

# Ou procurar por "supabase" ou "db"
docker ps | grep -E "postgres|supabase|db"
```

Você deve ter algo como:
- `postgres_postgres.1.xxxxx`
- `supabase_db.1.xxxxx`
- ou similar

### 2. Criar o database `bot_reativacao_vet`

```bash
# Substitua CONTAINER_NAME pelo nome real do container
POSTGRES_CONTAINER="postgres_postgres.1.byodefogahamy9w9gwfvvsxdg"

# Conectar ao Postgres
docker exec -it $POSTGRES_CONTAINER psql -U supabase_admin -d supabase

# Dentro do psql:
CREATE DATABASE bot_reativacao_vet ENCODING 'UTF8';

# Verificar
\l

# Sair
\q
```

### 3. Importar o schema

```bash
cd /root/mcp_bs_novo/bot_reativacao

# Importar schema
docker exec -i $POSTGRES_CONTAINER psql -U supabase_admin -d bot_reativacao_vet < database_schema_postgres.sql

# Verificar tabelas criadas
docker exec -it $POSTGRES_CONTAINER psql -U supabase_admin -d bot_reativacao_vet -c "\dt"

# Deve mostrar 13 tabelas:
# - customers
# - pets
# - vaccines
# - financial_debts
# - grooming_services
# - grooming_plans
# - appointments
# - completed_services
# - reactivation_logs
```

### 4. Atualizar o .env

```bash
nano .env
```

Cole exatamente isso:

```env
# Servidor
PORT=2080
NODE_ENV=production

# Banco de Dados PostgreSQL (Supabase)
# Use tasks.postgres_postgres para resolver via Swarm DNS
DB_HOST=tasks.postgres_postgres
DB_PORT=5432
DB_USER=supabase_admin
DB_PASSWORD=16bc41eb37268783dd01221d9a147372
DB_NAME=bot_reativacao_vet

# API WhatsApp (Evolution API)
WHATSAPP_API_URL=https://api.talkhub.me
WHATSAPP_API_TOKEN=9A6B3D106CFB-4F15-8B8C-472A27785114
WHATSAPP_INSTANCE_ID=BICHOSOLTO

# URLs dos Formulários de Satisfação
FORM_BANHO_SEM_TAXIDOG=https://form.talkhub.me/s/jlhjnwu8g1wumfddpdc0nilp
FORM_BANHO_COM_TAXIDOG=https://form.talkhub.me/s/sh6ead0tdtot8avbivitrygw
FORM_BANHO_TOSA_COM_TAXIDOG=https://form.talkhub.me/s/lt4e0a8q7pkrdn0u9dhuy2jv
FORM_BANHO_TOSA_SEM_TAXIDOG=https://form.talkhub.me/s/cmgidazc6001hr740cj2c912l

# URL de Avaliação Google
GOOGLE_REVIEW_URL=https://www.google.com/maps/place//data=!4m3!3m2!1s0x94c7db39b5690723:0x681622f15

# Configurações de Reativação
VACCINE_REACTIVATION_DAYS_BEFORE=21
VACCINE_REACTIVATION_ALTERNATIVE_DAYS=7
VACCINE_ANNUAL_REACTIVATION_DAYS=30
FINANCIAL_MIN_AMOUNT_FOR_CHARGE=300
FINANCIAL_CHARGE_INTERVAL_DAYS=30
GROOMING_WEEKLY_REMINDER_DAY=3
GROOMING_MONTHLY_REMINDER_DAYS=30
APPOINTMENT_CONFIRMATION_DAYS_BEFORE=1

# Horários de Execução (Cron)
CRON_VACCINES=0 9 * * *
CRON_FINANCIAL=0 10 * * *
CRON_GROOMING=0 11 * * *
CRON_APPOINTMENTS=0 8 * * *
CRON_SATISFACTION=0 * * * *

# Logging
LOG_LEVEL=info
```

### 5. Build e Deploy

```bash
# Executar deploy
./deploy_swarm.sh
```

### 6. Verificar

```bash
# Ver status
docker stack ps reativa_bicho_solto

# Ver logs
docker service logs -f reativa_bicho_solto_bot-reativacao

# Health check
curl https://automacaobs.talkhub.me/health

# Deve retornar:
# {"status":"healthy","timestamp":"...","uptime":...}
```

## 🔧 Troubleshooting

### Se DB_HOST=tasks.postgres_postgres não funcionar

Você pode tentar outras opções de resolução de DNS no Swarm:

```bash
# Opção 1: Ver nome exato do serviço Swarm
docker service ls | grep postgres
# Use: DB_HOST=postgres_postgres

# Opção 2: Ver IP do container
docker inspect $(docker ps -qf "name=postgres_postgres") | grep IPAddress
# Use: DB_HOST=10.0.x.x  (IP encontrado)

# Opção 3: Usar nome do container diretamente
docker ps | grep postgres | awk '{print $NF}'
# Use: DB_HOST=postgres_postgres.1.byodefogahamy9w9gwfvvsxdg

# Opção 4: Adicionar ambos os serviços na mesma rede
# Isso pode ser necessário se os serviços estiverem em redes diferentes
```

### Testar conexão manualmente

```bash
# Dentro do container do bot (após deploy)
docker exec -it $(docker ps -qf "name=reativa_bicho_solto") sh

# Dentro do container:
apk add postgresql-client
psql -h db -p 5344 -U supabase_admin -d bot_reativacao_vet

# Se conectar, está ok!
```

### Ver logs de erro de conexão

```bash
docker service logs reativa_bicho_solto_bot-reativacao 2>&1 | grep -i "erro\|error\|database\|connect"
```

## ✅ Checklist

- [ ] Container PostgreSQL identificado
- [ ] Database `bot_reativacao_vet` criado
- [ ] Schema importado (13 tabelas)
- [ ] Arquivo `.env` configurado
- [ ] Deploy executado: `./deploy_swarm.sh`
- [ ] Serviço rodando: `docker stack ps reativa_bicho_solto`
- [ ] Health OK: `curl https://automacaobs.talkhub.me/health`
- [ ] Logs sem erro: `docker service logs reativa_bicho_solto_bot-reativacao`

## 🎯 Comandos Rápidos

```bash
# Deploy
./deploy_swarm.sh

# Status
docker stack ps reativa_bicho_solto

# Logs
docker service logs -f reativa_bicho_solto_bot-reativacao

# Remover (se precisar recomeçar)
docker stack rm reativa_bicho_solto

# Acessar Postgres
docker exec -it $(docker ps -qf "name=postgres") psql -U supabase_admin -d bot_reativacao_vet

# Testar Evolution API
curl --request POST \
  --url https://api.talkhub.me/message/sendText/BICHOSOLTO \
  --header 'Content-Type: application/json' \
  --header 'apikey: 9A6B3D106CFB-4F15-8B8C-472A27785114' \
  --data '{"number":"5519999914201","text":"Teste Bot Reativação"}'
```
