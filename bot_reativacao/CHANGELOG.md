# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2025-10-27

### Adicionado

#### Core
- Sistema completo de reativação automatizada para clínicas veterinárias
- Integração com WhatsApp via TalkHub API
- Sistema de agendamento (scheduler) com cron jobs configuráveis
- Logger centralizado com Winston
- Health checks e monitoramento
- Suporte a Docker e Docker Swarm
- Integração com Traefik para SSL/TLS automático

#### Módulos de Reativação

##### 1. Reativação de Vacinas
- Monitoramento diário de vacinas vencidas
- Reativação 21 dias antes da próxima dose
- Reativação alternativa 7 dias antes (doses entre 14-21 dias)
- Reativação de vacinas anuais 30 dias antes do vencimento
- Mensagens personalizadas por tipo de vacina

##### 2. Reativação Financeira
- Identificação automática de débitos em atraso
- Mensagens sutis para valores menores
- Cobranças formais para valores acima de R$ 300
- Controle de intervalo mínimo de 30 dias entre cobranças
- Registro de histórico de cobranças

##### 3. Reativação de Banhos e Tosas
- Lembretes semanais para clientes com plano mensal
- Lembretes mensais para banhos únicos
- Ofertas automáticas de planos com desconto
- Verificação de planos específicos por raça do pet
- Sugestões personalizadas de serviços

##### 4. Confirmação de Consultas
- Confirmação automática 1 dia antes da consulta
- Verificação de consultas futuras para evitar duplicatas
- Não envia para retornos já agendados
- Mensagens com data, hora e tipo de consulta

##### 5. Pesquisa de Satisfação
- Envio automático após conclusão de serviços
- Formulários específicos por tipo de serviço:
  - Banho sem taxidog
  - Banho com taxidog
  - Banho e tosa com taxidog
  - Banho e tosa sem taxidog
- Redirecionamento para Google Reviews (3+ estrelas)
- Registro de pesquisas enviadas

#### Infraestrutura
- Dockerfile otimizado com Node.js 20 Alpine
- Docker Compose para desenvolvimento e produção
- Suporte a Docker Swarm
- Configuração completa do Traefik
- Health checks automáticos
- Logs persistentes

#### Banco de Dados
- Schema completo para MySQL
- Tabelas de clientes, pets, vacinas, débitos, banhos, consultas
- Tabela de logs de reativação
- Índices otimizados para queries frequentes
- Suporte a UTF-8 completo

#### API REST
- Endpoint de health check (`/health`)
- Endpoint de status dos jobs (`/status`)
- Endpoint para executar jobs manualmente (`/jobs/:jobName/run`)
- Endpoint de informações (`/`)

#### Scripts Utilitários
- Script de deploy automatizado (`deploy.sh`)
- Script de testes de jobs (`test_jobs.sh`)
- Configuração de desenvolvimento com hot reload

#### Documentação
- README completo com guia de uso
- Guia de deployment detalhado
- Documentação de troubleshooting
- Exemplos de configuração
- Comentários inline no código

### Segurança
- Validação de números de telefone
- Rate limiting entre envios (2 segundos)
- HTTPS obrigatório via Traefik
- Certificados SSL/TLS automáticos via Let's Encrypt
- Sanitização de dados sensíveis nos logs

### Configuração
- Arquivo `.env.example` com todas as variáveis necessárias
- Configuração flexível de horários via cron expressions
- Configuração de URLs de formulários
- Configuração de limites e intervalos

### Observações
- Primeira versão estável do sistema
- Testado com MySQL 8.0+
- Compatível com Node.js 20+
- Requer Docker 20.10+

## [Não Lançado]

### Planejado para próximas versões
- Dashboard web para visualização de métricas
- Webhook para receber respostas dos clientes
- Integração com múltiplas instâncias do WhatsApp
- Suporte a outros canais (SMS, Email)
- Sistema de templates personalizáveis
- Relatórios automáticos por email
- API para integração com outros sistemas
- Suporte a multi-tenancy (múltiplas clínicas)
