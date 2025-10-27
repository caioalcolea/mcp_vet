# Setup PostgreSQL para Bot de Reativação

## Contexto do Servidor

Seu servidor já possui:
- **PostgreSQL 14** rodando via Supabase (porta 5432)
- **MySQL 8.0** para o sistema Vetcare (porta 3306) - **NÃO TOCAR**
- Traefik + Docker Swarm

## Opções de Setup

### Opção 1: Usar o PostgreSQL existente do Supabase (Recomendado)

Esta é a opção mais simples e segura, pois não interfere com o MySQL do Vetcare.

#### 1. Identificar o container PostgreSQL

```bash
# Listar containers Postgres
docker ps | grep postgres

# Você deve ver algo como: postgres_postgres.1.byodefogahamy9w9gwfvvsxdg
```

#### 2. Criar o database bot_reativacao_vet

```bash
# Conectar ao Postgres
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres

# Dentro do psql:
CREATE DATABASE bot_reativacao_vet ENCODING 'UTF8' LC_COLLATE='pt_BR.UTF-8' LC_CTYPE='pt_BR.UTF-8';

# Listar databases para confirmar
\l

# Sair
\q
```

#### 3. Importar o schema

```bash
# Importar schema PostgreSQL
docker exec -i postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet < database_schema_postgres.sql
```

#### 4. Verificar tabelas criadas

```bash
# Conectar ao database
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet

# Listar tabelas
\dt

# Ver estrutura de uma tabela
\d customers

# Sair
\q
```

#### 5. Configurar .env

```bash
# Copiar .env.example
cp .env.example .env

# Editar .env
nano .env
```

Configure assim:
```env
# Banco de Dados PostgreSQL (usando Postgres do Supabase)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=SUA_SENHA_POSTGRES_AQUI
DB_NAME=bot_reativacao_vet

# Se o bot estiver em container Docker, use:
# DB_HOST=postgres_postgres.1.byodefogahamy9w9gwfvvsxdg
# OU o IP do container Postgres
```

---

### Opção 2: PostgreSQL em container separado (Alternativa)

Se preferir isolar completamente, pode subir um PostgreSQL separado.

⚠️ **Importante**: Use uma porta diferente das já ocupadas!

Portas ocupadas: 80, 443, 5050, 8000, 8001, 8080, 8443, 8444, 9000, 9001, 9443, 3000, 3001, 3306, 33060, 4333, **5432**, 6333, 6334

**Nova porta sugerida**: 5433

#### 1. Criar docker-compose para Postgres isolado

```yaml
# docker-compose.postgres.yml
version: '3.8'

services:
  postgres-bot-reativacao:
    image: postgres:14
    environment:
      POSTGRES_USER: botuser
      POSTGRES_PASSWORD: senha_forte_aqui
      POSTGRES_DB: bot_reativacao_vet
    ports:
      - "5433:5432"  # Porta 5433 no host, 5432 no container
    volumes:
      - postgres-bot-data:/var/lib/postgresql/data
    networks:
      - traefik-public
    deploy:
      placement:
        constraints:
          - node.role == manager

volumes:
  postgres-bot-data:

networks:
  traefik-public:
    external: true
```

#### 2. Deploy do Postgres

```bash
docker stack deploy -c docker-compose.postgres.yml postgres-bot
```

#### 3. Importar schema

```bash
# Aguardar inicialização (10 segundos)
sleep 10

# Importar
docker exec -i $(docker ps -qf "name=postgres-bot") psql -U botuser -d bot_reativacao_vet < database_schema_postgres.sql
```

#### 4. Configurar .env

```env
DB_HOST=postgres-bot-reativacao
DB_PORT=5432
DB_USER=botuser
DB_PASSWORD=senha_forte_aqui
DB_NAME=bot_reativacao_vet
```

---

## Verificações Finais

### 1. Testar conexão

```bash
# Se usando Postgres do Supabase
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet -c "SELECT COUNT(*) FROM grooming_plans;"

# Deve retornar 3 planos pré-cadastrados
```

### 2. Ver estrutura completa

```bash
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet

# Dentro do psql:
\dt                    # Listar todas as tabelas
\dT                    # Listar ENUMs
\df                    # Listar funções
\d customers           # Ver estrutura da tabela customers
SELECT * FROM grooming_plans;  # Ver planos cadastrados
```

### 3. Verificar usuário e senha

Se não souber a senha do Postgres, você pode:

```bash
# Ver variáveis de ambiente do container
docker inspect postgres_postgres.1.byodefogahamy9w9gwfvvsxdg | grep -A 10 Env

# OU criar um novo usuário
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres

# Dentro do psql:
CREATE USER botuser WITH PASSWORD 'senha_segura_aqui';
GRANT ALL PRIVILEGES ON DATABASE bot_reativacao_vet TO botuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO botuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO botuser;
```

---

## Migrations (Opcional)

Se você já tem dados no MySQL do Vetcare e quer copiar para o PostgreSQL:

### 1. Exportar dados do MySQL

```bash
# Exportar customers
docker exec vetcare_db mysql -u root -pMadu*0112talk vetcare_db -e "SELECT * FROM customers INTO OUTFILE '/tmp/customers.csv' FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"
```

### 2. Importar no PostgreSQL

```bash
# Copiar CSV do container MySQL
docker cp vetcare_db:/tmp/customers.csv ./customers.csv

# Importar no Postgres
docker exec -i postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet -c "\COPY customers FROM STDIN WITH CSV HEADER" < customers.csv
```

---

## Troubleshooting

### Erro: "database bot_reativacao_vet does not exist"

```bash
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -c "CREATE DATABASE bot_reativacao_vet;"
```

### Erro: "relation xxx does not exist"

O schema não foi importado. Execute:
```bash
docker exec -i postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet < database_schema_postgres.sql
```

### Erro: "FATAL: password authentication failed"

Verifique a senha no .env e tente resetar:
```bash
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -c "ALTER USER postgres PASSWORD 'nova_senha';"
```

### Erro: "no pg_hba.conf entry for host"

Adicione permissão de conexão:
```bash
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg sh -c "echo 'host all all 0.0.0.0/0 md5' >> /var/lib/postgresql/data/pg_hba.conf"
docker restart postgres_postgres.1.byodefogahamy9w9gwfvvsxdg
```

---

## Comandos Úteis

```bash
# Ver databases
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -c "\l"

# Ver tabelas
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet -c "\dt"

# Backup
docker exec postgres_postgres.1.byodefogahamy9w9gwfvvsxdg pg_dump -U postgres bot_reativacao_vet > backup_$(date +%Y%m%d).sql

# Restore
docker exec -i postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -d bot_reativacao_vet < backup.sql

# Ver tamanho do database
docker exec -it postgres_postgres.1.byodefogahamy9w9gwfvvsxdg psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('bot_reativacao_vet'));"
```

---

## Próximos Passos

Após configurar o PostgreSQL:

1. ✅ Database criado
2. ✅ Schema importado
3. ✅ .env configurado
4. 🚀 Fazer build e deploy:
   ```bash
   ./deploy_swarm.sh
   ```

5. ✅ Verificar funcionamento:
   ```bash
   curl https://automacaobs.talkhub.me/health
   ```
