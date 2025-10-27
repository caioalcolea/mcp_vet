# Bot de Reativação - Clínica Veterinária

Sistema automático de reativação e engajamento de clientes para clínicas veterinárias, com integração ao WhatsApp via TalkHub.

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
- Formulários específicos por tipo de serviço:
  - Banho sem taxidog
  - Banho com taxidog
  - Banho e tosa com taxidog
  - Banho e tosa sem taxidog
- Redirecionamento para Google Reviews (3+ estrelas)

## Requisitos

- Node.js 20+
- MySQL 5.7+
- Docker e Docker Compose
- Conta TalkHub (WhatsApp API)
- Domínio configurado (automacaobs.talkhub.me)

## Instalação

### 1. Clone o repositório

```bash
cd bot_reativacao
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e configure:

```bash
cp .env.example .env
nano .env
```

Variáveis importantes:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - Configurações do banco de dados
- `WHATSAPP_API_TOKEN`, `WHATSAPP_INSTANCE_ID` - Credenciais TalkHub
- `GOOGLE_REVIEW_URL` - URL para avaliações no Google

### 4. Configure o banco de dados

Execute o script SQL para criar as tabelas:

```bash
mysql -u root -p veterinaria < database_schema.sql
```

## Uso

### Desenvolvimento

```bash
npm run dev
```

### Produção

```bash
npm run build
npm start
```

### Docker

```bash
docker-compose up -d
```

### Docker Swarm

```bash
docker stack deploy -c docker-compose.yml bot-reativacao
```

## Endpoints da API

### Health Check
```
GET /health
```

Retorna o status de saúde do serviço.

### Status dos Jobs
```
GET /status
```

Retorna o status de todos os jobs agendados.

### Executar Job Manualmente
```
POST /jobs/:jobName/run
```

Executa um job específico manualmente.

Jobs disponíveis:
- `vaccines` - Reativação de vacinas
- `financial` - Reativação financeira
- `grooming` - Reativação de banhos
- `appointments` - Confirmação de consultas
- `satisfaction` - Pesquisa de satisfação

Exemplo:
```bash
curl -X POST http://localhost:2080/jobs/vaccines/run
```

## Agendamento (Cron)

Por padrão, os jobs são executados nos seguintes horários:

- **Vacinas**: 09:00 todos os dias
- **Financeiro**: 10:00 todos os dias
- **Banhos**: 11:00 todos os dias
- **Consultas**: 08:00 todos os dias
- **Satisfação**: A cada hora

Para personalizar, edite as variáveis no `.env`:
```env
CRON_VACCINES=0 9 * * *
CRON_FINANCIAL=0 10 * * *
CRON_GROOMING=0 11 * * *
CRON_APPOINTMENTS=0 8 * * *
CRON_SATISFACTION=0 * * * *
```

## Estrutura do Projeto

```
bot_reativacao/
├── src/
│   ├── config/          # Configurações e conexão com DB
│   ├── modules/         # Módulos de reativação
│   │   ├── vaccines/
│   │   ├── financial/
│   │   ├── grooming/
│   │   ├── appointments/
│   │   └── satisfaction/
│   ├── services/        # Serviços (WhatsApp, Scheduler)
│   ├── utils/           # Utilidades (Logger, Date Helpers)
│   ├── types/           # TypeScript types
│   └── index.ts         # Entrada da aplicação
├── logs/                # Logs da aplicação
├── docker-compose.yml   # Configuração Docker
├── Dockerfile
├── database_schema.sql  # Schema do banco de dados
├── package.json
├── tsconfig.json
└── README.md
```

## Logs

Os logs são armazenados em:
- `logs/combined.log` - Todos os logs
- `logs/error.log` - Apenas erros

Para visualizar logs em tempo real:
```bash
tail -f logs/combined.log
```

## Monitoramento

### Health Check
O serviço expõe um endpoint de health check em `/health` que pode ser usado para monitoramento:

```bash
curl http://automacaobs.talkhub.me/health
```

### Traefik
O serviço está configurado com health checks no Traefik para garantir alta disponibilidade.

## Segurança

- Todas as conexões HTTP são automaticamente redirecionadas para HTTPS
- Certificados SSL/TLS gerenciados automaticamente via Let's Encrypt
- Validação de números de telefone antes do envio
- Rate limiting entre envios (2 segundos)

## Troubleshooting

### Problema: Mensagens não estão sendo enviadas

1. Verifique as credenciais do TalkHub no `.env`
2. Verifique os logs em `logs/error.log`
3. Teste a API do TalkHub manualmente
4. Verifique se os números de telefone estão no formato correto

### Problema: Jobs não estão executando

1. Verifique se o scheduler está rodando:
   ```bash
   curl http://localhost:2080/status
   ```
2. Verifique os logs do scheduler
3. Execute o job manualmente para testar:
   ```bash
   curl -X POST http://localhost:2080/jobs/vaccines/run
   ```

### Problema: Erro de conexão com banco de dados

1. Verifique as credenciais no `.env`
2. Teste a conexão manualmente:
   ```bash
   mysql -h DB_HOST -u DB_USER -p DB_NAME
   ```
3. Verifique se as tabelas foram criadas corretamente

## Personalização

### Alterar mensagens

As mensagens enviadas podem ser personalizadas editando os arquivos em `src/modules/*/`:
- `vaccineReactivation.ts` - Mensagens de vacinas
- `financialReactivation.ts` - Mensagens financeiras
- `groomingReactivation.ts` - Mensagens de banho
- `appointmentConfirmation.ts` - Mensagens de confirmação
- `satisfactionSurvey.ts` - Mensagens de pesquisa

### Alterar horários

Edite as variáveis `CRON_*` no arquivo `.env` ou modifique diretamente em `src/config/index.ts`.

### Adicionar novos formulários

Adicione as URLs dos formulários no `.env` e atualize a lógica em `src/modules/satisfaction/satisfactionSurvey.ts`.

## Suporte

Para problemas ou dúvidas:
1. Verifique os logs em `logs/`
2. Consulte a documentação do TalkHub
3. Entre em contato com o suporte técnico

## Licença

MIT

## Versão

1.0.0
