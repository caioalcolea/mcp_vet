# Guia de Solução - MySQL e Evolution API

## Problema 1: MySQL não conecta

### Erro apresentado:
```
ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock' (2)
```

### Causa:
O MySQL não está rodando ou não está acessível via socket local.

### Soluções:

#### Opção 1: Verificar se MySQL está rodando

```bash
# Verificar status do MySQL
systemctl status mysql

# Se não estiver rodando, iniciar
systemctl start mysql

# Habilitar para iniciar automaticamente
systemctl enable mysql
```

#### Opção 2: MySQL está em container Docker

Se o MySQL está rodando em um container Docker, você precisa acessá-lo de forma diferente:

```bash
# Encontrar o container do MySQL
docker ps | grep mysql

# Opção A: Importar via docker exec
docker exec -i mysql_container_name mysql -u root -pMadu*0112talk veterinaria < database_schema.sql

# Opção B: Conectar e importar
cat database_schema.sql | docker exec -i mysql_container_name mysql -u root -pMadu*0112talk veterinaria
```

#### Opção 3: MySQL em host remoto

Se o MySQL está em outro servidor (não localhost):

```bash
# Conectar especificando host
mysql -h IP_DO_SERVIDOR -u root -pMadu*0112talk veterinaria < database_schema.sql
```

#### Opção 4: Usar o Docker Compose do bot (com MySQL incluído)

O arquivo `docker-compose.dev.yml` já inclui um MySQL:

```bash
# Subir o MySQL junto com o bot
cd /root/mcp_bs_novo/bot_reativacao
docker-compose -f docker-compose.dev.yml up -d mysql

# Aguardar alguns segundos para o MySQL inicializar
sleep 10

# Importar o schema
docker-compose -f docker-compose.dev.yml exec mysql mysql -u root -proot123 veterinaria < database_schema.sql
```

#### Verificar conexão:

```bash
# Teste de conexão simples
mysql -u root -pMadu*0112talk -e "SHOW DATABASES;"

# Se estiver em Docker
docker exec -it mysql_container_name mysql -u root -pMadu*0112talk -e "SHOW DATABASES;"
```

---

## Problema 2: API WhatsApp corrigida

### Mudanças realizadas:

O serviço WhatsApp foi atualizado para usar o formato correto da **Evolution API**:

#### Antes (incorreto):
```typescript
// Headers
'Authorization': `Bearer ${token}`

// Payload
{
  "instanceId": "BICHOSOLTO",
  "number": "5519999999999",
  "message": "texto"
}

// Endpoint
POST /message/send-text
```

#### Depois (correto):
```typescript
// Headers
'apikey': '9A6B3D106CFB-4F15-8B8C-472A27785114'

// Payload
{
  "number": "5519999999999",
  "text": "texto"
}

// Endpoint
POST /message/sendText/BICHOSOLTO
```

### Formato correto dos endpoints:

1. **Enviar texto**:
   - `POST /message/sendText/{instance}`

2. **Enviar mídia**:
   - `POST /message/sendMedia/{instance}`
   - Payload: `{ number, mediatype, mimetype, caption, media }`

3. **Buscar mensagens**:
   - `POST /chat/findMessages/{instance}`

---

## Configuração do .env (verificada e correta)

Seu arquivo `.env` está correto:

```env
# Servidor
PORT=2080
NODE_ENV=production

# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=Madu*0112talk
DB_NAME=veterinaria

# API WhatsApp (TalkHub/Evolution API)
WHATSAPP_API_URL=https://api.talkhub.me
WHATSAPP_API_TOKEN=9A6B3D106CFB-4F15-8B8C-472A27785114
WHATSAPP_INSTANCE_ID=BICHOSOLTO
```

**Nota importante:** Se o MySQL estiver em um container Docker, altere:
```env
DB_HOST=host.docker.internal  # Para acessar MySQL do host
# OU
DB_HOST=IP_DO_CONTAINER_MYSQL  # IP do container MySQL
```

---

## Próximos passos

### 1. Resolver o MySQL:

Escolha uma das opções acima e importe o schema.

### 2. Testar conexão com Evolution API:

```bash
# Testar envio de mensagem (substitua o número por um válido)
curl --request POST \
  --url https://api.talkhub.me/message/sendText/BICHOSOLTO \
  --header 'Content-Type: application/json' \
  --header 'apikey: 9A6B3D106CFB-4F15-8B8C-472A27785114' \
  --data '{
    "number": "5519999914201",
    "text": "Teste de envio via Evolution API"
  }'
```

### 3. Rebuild do bot com correções:

```bash
cd /root/mcp_bs_novo/bot_reativacao

# Parar container antigo (se existir)
docker-compose down

# Rebuild com as correções
docker-compose build --no-cache

# Subir novamente
docker-compose up -d

# Ver logs
docker-compose logs -f
```

---

## Verificação final

Após subir o bot, verifique:

```bash
# Health check
curl http://localhost:2080/health

# Status dos jobs
curl http://localhost:2080/status

# Testar job de vacinas (vai fazer query no banco)
curl -X POST http://localhost:2080/jobs/vaccines/run
```

---

## Troubleshooting adicional

### Logs do bot:
```bash
docker-compose logs -f bot-reativacao
```

### Logs do MySQL (se em Docker):
```bash
docker-compose logs -f mysql
```

### Entrar no container do bot:
```bash
docker-compose exec bot-reativacao sh
```

### Testar conexão com banco de dentro do container:
```bash
docker-compose exec bot-reativacao sh -c "nc -zv localhost 3306"
```

---

## Contato de suporte

Se os problemas persistirem:

1. Verificar logs detalhados em `/root/mcp_bs_novo/bot_reativacao/logs/`
2. Testar conexão MySQL manualmente
3. Testar API Evolution manualmente com curl
4. Verificar se a instância BICHOSOLTO está ativa no TalkHub
