# Bot de Reativação - Clínica Veterinária (Docker Swarm + PostgreSQL)

Sistema automático de reativação e engajamento de clientes para clínicas veterinárias, com integração ao WhatsApp via Evolution API.

## 🆕 Mudanças Principais

- ✅ **PostgreSQL** ao invés de MySQL (compatível com infraestrutura existente)
- ✅ **Docker Swarm** pronto para produção
- ✅ **Evolution API** integrada corretamente
- ✅ **Porta 2080** (não conflita com serviços existentes)
- ✅ **Traefik** com SSL/TLS automático

## Funcionalidades

### 1. Reativação de Vacinas
- Monitoramento diário de vacinas vencidas ou próximas ao vencimento
- Reativação 21 dias antes da próxima dose
- Reativação alternativa 7 dias antes se a dose estiver entre 14-21 dias
- Reativação de vacinas anuais 30 dias antes do vencimento de 1 ano

### 2. Reativação Financeira
- Identificação de débitos em atraso
- Mensagens sutis para valores menores
- Cobranças formais para valores acima de R$ 300
- Limite de 1 cobrança a cada 30 dias por débito

### 3. Reativação de Banhos e Tosas
- Lembretes semanais para clientes com plano mensal
- Lembretes mensais (30 dias) para banhos únicos
- Ofertas de planos com desconto
- Verificação de planos específicos por raça

### 4. Confirmação de Consultas
- Confirmação automática 1 dia antes da consulta
- Não envia para retornos ou consultas já agendadas
- Verificação de consultas futuras

### 5. Pesquisa de Satisfação
- Envio automático após conclusão de serviços
- Formulários específicos por tipo de serviço
- Redirecionamento para Google Reviews (3+ estrelas)

## Requisitos

- Docker 20.10+
- Docker Swarm ativo
- PostgreSQL 14+ (pode usar o Supabase existente)
- Traefik rodando
- Conta TalkHub (Evolution API)
- Domínio: automacaobs.talkhub.me

## Instalação Rápida

### 1. Setup do PostgreSQL

Ver guia completo em [POSTGRES_SETUP.md](POSTGRES_SETUP.md)

```bash
# Opção 1: Usar Postgres do Supabase (Recomendado)
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres

# Dentro do psql:
CREATE DATABASE bot_reativacao_vet ENCODING 'UTF8';
\q

# Importar schema
docker exec -i postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet < database_schema_postgres.sql
```

### 2. Configurar variáveis

```bash
# Copiar exemplo
cp .env.example .env

# Editar
nano .env
```

**Variáveis principais**:
```env
# PostgreSQL (usando Postgres existente)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=SUA_SENHA_AQUI
DB_NAME=bot_reativacao_vet

# Evolution API
WHATSAPP_API_URL=https://api.talkhub.me
WHATSAPP_API_TOKEN=9A6B3D106CFB-4F15-8B8C-472A27785114
WHATSAPP_INSTANCE_ID=BICHOSOLTO

# Formulários (já configurados)
FORM_BANHO_SEM_TAXIDOG=https://form.talkhub.me/s/jlhjnwu8g1wumfddpdc0nilp
FORM_BANHO_COM_TAXIDOG=https://form.talkhub.me/s/sh6ead0tdtot8avbivitrygw
FORM_BANHO_TOSA_COM_TAXIDOG=https://form.talkhub.me/s/lt4e0a8q7pkrdn0u9dhuy2jv
FORM_BANHO_TOSA_SEM_TAXIDOG=https://form.talkhub.me/s/cmgidazc6001hr740cj2c912l

# Google Reviews
GOOGLE_REVIEW_URL=https://www.google.com/maps/place//data=...
```

### 3. Deploy no Swarm

```bash
# Executar script de deploy
./deploy_swarm.sh
```

O script faz automaticamente:
- ✅ Build da imagem Docker
- ✅ Deploy no Swarm com nome `reativa_bicho_solto`
- ✅ Configuração do Traefik
- ✅ Health checks
- ✅ Verificações

### 4. Verificar

```bash
# Ver status
docker stack ps reativa_bicho_solto

# Ver logs
docker service logs -f reativa_bicho_solto_bot-reativacao

# Health check
curl https://automacaobs.talkhub.me/health

# Status dos jobs
curl https://automacaobs.talkhub.me/status
```

## Comandos Úteis

### Gerenciamento do Stack

```bash
# Ver status
docker stack ps reativa_bicho_solto

# Ver serviços
docker stack services reativa_bicho_solto

# Ver logs
docker service logs -f reativa_bicho_solto_bot-reativacao

# Atualizar (após mudanças)
./deploy_swarm.sh

# Remover stack
docker stack rm reativa_bicho_solto

# Escalar
docker service scale reativa_bicho_solto_bot-reativacao=2
```

### Executar Jobs Manualmente

```bash
# Vacinas
curl -X POST https://automacaobs.talkhub.me/jobs/vaccines/run

# Financeiro
curl -X POST https://automacaobs.talkhub.me/jobs/financial/run

# Banhos
curl -X POST https://automacaobs.talkhub.me/jobs/grooming/run

# Consultas
curl -X POST https://automacaobs.talkhub.me/jobs/appointments/run

# Satisfação
curl -X POST https://automacaobs.talkhub.me/jobs/satisfaction/run
```

### Banco de Dados

```bash
# Conectar ao Postgres
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet

# Ver tabelas
\dt

# Ver clientes
SELECT * FROM customers LIMIT 10;

# Ver logs de hoje
SELECT reactivation_type, COUNT(*) as total
FROM reactivation_logs
WHERE DATE(sent_at) = CURRENT_DATE
GROUP BY reactivation_type;

# Sair
\q
```

## Agendamento (Cron)

Jobs executam automaticamente nos seguintes horários:

- **Vacinas**: 09:00 diariamente (`CRON_VACCINES=0 9 * * *`)
- **Financeiro**: 10:00 diariamente (`CRON_FINANCIAL=0 10 * * *`)
- **Banhos**: 11:00 diariamente (`CRON_GROOMING=0 11 * * *`)
- **Consultas**: 08:00 diariamente (`CRON_APPOINTMENTS=0 8 * * *`)
- **Satisfação**: A cada hora (`CRON_SATISFACTION=0 * * * *`)

Para personalizar, edite no `.env`.

## Estrutura do Projeto

```
bot_reativacao/
├── src/
│   ├── config/              # Configurações (PostgreSQL)
│   ├── modules/             # Módulos de reativação
│   │   ├── vaccines/
│   │   ├── financial/
│   │   ├── grooming/
│   │   ├── appointments/
│   │   └── satisfaction/
│   ├── services/            # WhatsApp + Scheduler
│   ├── utils/               # Logger + Date Helpers
│   └── types/               # TypeScript types
├── docker-compose.yml       # Swarm config
├── Dockerfile
├── database_schema_postgres.sql  # Schema PostgreSQL
├── deploy_swarm.sh          # Deploy automático
└── POSTGRES_SETUP.md        # Guia PostgreSQL
```

## Endpoints da API

- **Health**: `GET /health`
- **Status**: `GET /status`
- **Executar Job**: `POST /jobs/:jobName/run`
- **Info**: `GET /`

## Monitoramento

### Health Checks

```bash
# Via curl
curl https://automacaobs.talkhub.me/health

# Status dos jobs
curl https://automacaobs.talkhub.me/status
```

### Logs

```bash
# Logs em tempo real
docker service logs -f reativa_bicho_solto_bot-reativacao

# Últimas 100 linhas
docker service logs --tail 100 reativa_bicho_solto_bot-reativacao

# Logs de erro
docker service logs reativa_bicho_solto_bot-reativacao 2>&1 | grep ERROR
```

### Métricas

```bash
# Ver consumo de recursos
docker stats $(docker ps -qf "name=reativa_bicho_solto")

# Ver número de replicas
docker service ls | grep bot-reativacao
```

## Troubleshooting

### Problema: Serviço não inicia

```bash
# Ver estado do serviço
docker service ps reativa_bicho_solto_bot-reativacao --no-trunc

# Ver logs de erro
docker service logs reativa_bicho_solto_bot-reativacao 2>&1 | grep -i error

# Verificar imagem
docker images | grep bot-reativacao-vet
```

### Problema: Não conecta no PostgreSQL

Ver guia completo: [POSTGRES_SETUP.md](POSTGRES_SETUP.md)

```bash
# Testar conexão
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet -c "SELECT 1;"

# Verificar credenciais no .env
cat .env | grep DB_
```

### Problema: Mensagens não enviam

```bash
# Testar Evolution API
curl --request POST \
  --url https://api.talkhub.me/message/sendText/BICHOSOLTO \
  --header 'Content-Type: application/json' \
  --header 'apikey: 9A6B3D106CFB-4F15-8B8C-472A27785114' \
  --data '{
    "number": "5519999914201",
    "text": "Teste"
  }'

# Ver logs do serviço
docker service logs reativa_bicho_solto_bot-reativacao | grep -i whatsapp
```

### Problema: Jobs não executam

```bash
# Ver status
curl https://automacaobs.talkhub.me/status

# Executar manualmente
curl -X POST https://automacaobs.talkhub.me/jobs/vaccines/run

# Ver logs do scheduler
docker service logs reativa_bicho_solto_bot-reativacao | grep -i "job\|cron\|scheduler"
```

## Segurança

- ✅ HTTPS obrigatório via Traefik + Let's Encrypt
- ✅ Validação de números de telefone
- ✅ Rate limiting (2 segundos entre envios)
- ✅ Logs de todas as ações
- ✅ Credenciais via .env (não commitadas)
- ✅ Health checks automáticos

## Backup

```bash
# Backup do PostgreSQL
docker exec postgres_postgres.1.byodefogahamy9w9gwfvvsxdg pg_dump -U postgres bot_reativacao_vet > backup_bot_$(date +%Y%m%d).sql

# Restore
docker exec -i postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet < backup_bot_20241027.sql
```

## Atualização

```bash
# 1. Pull das mudanças
git pull

# 2. Rebuild e redeploy
./deploy_swarm.sh

# O script faz rolling update automático sem downtime
```

## Suporte

- 📖 [Guia PostgreSQL](POSTGRES_SETUP.md)
- 🐛 [Troubleshooting](TROUBLESHOOTING.md)
- 🚀 [Deployment](DEPLOYMENT.md)

## Licença

MIT

## Versão

2.0.0 (PostgreSQL + Docker Swarm)
