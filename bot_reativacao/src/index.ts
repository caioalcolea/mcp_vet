import express, { Request, Response } from 'express';
import { config } from './config';
import { database } from './config/database';
import { scheduler } from './services/scheduler';
import { logger } from './utils/logger';
import dashboardRoutes from './routes/dashboard';
import fs from 'fs';
import path from 'path';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use('/public', express.static(path.join(__dirname, 'public')));

// Criar diretório de logs se não existir
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.nodeEnv,
  });
});

// Status endpoint
app.get('/status', (req: Request, res: Response) => {
  const jobsStatus = scheduler.getJobsStatus();

  res.status(200).json({
    status: 'running',
    jobs: jobsStatus,
    timestamp: new Date().toISOString(),
  });
});

// Endpoint para executar job manualmente
app.post('/jobs/:jobName/run', async (req: Request, res: Response) => {
  const { jobName } = req.params;

  try {
    await scheduler.runJobManually(jobName);
    res.status(200).json({
      success: true,
      message: `Job ${jobName} executado com sucesso`,
    });
  } catch (error: any) {
    logger.error(`Erro ao executar job ${jobName} manualmente:`, error);
    res.status(500).json({
      success: false,
      message: `Erro ao executar job ${jobName}`,
      error: error.message,
    });
  }
});

// Dashboard HTML
app.get('/dashboard', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Rotas da API do dashboard
app.use('/api/dashboard', dashboardRoutes);

// Endpoint de informações
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'Bot Reativação Veterinária',
    version: '2.0.0',
    description: 'Sistema de reativação automática de clientes para veterinária',
    endpoints: {
      health: '/health',
      status: '/status',
      dashboard: '/dashboard',
      runJob: '/jobs/:jobName/run',
    },
    availableJobs: [
      'vaccines',
      'financial',
      'grooming',
      'appointments',
      'satisfaction',
    ],
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  logger.error('Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: config.server.nodeEnv === 'development' ? err.message : undefined,
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Iniciando shutdown gracioso...');

  // Parar scheduler
  scheduler.stop();

  // Desconectar banco de dados
  await database.disconnect();

  logger.info('Shutdown concluído');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Inicialização
const startServer = async () => {
  try {
    logger.info('Iniciando Bot Reativação Veterinária...');

    // Conectar ao banco de dados
    await database.connect();
    logger.info('Banco de dados conectado');

    // Iniciar scheduler
    scheduler.start();
    logger.info('Scheduler iniciado');

    // Iniciar servidor HTTP
    app.listen(config.server.port, () => {
      logger.info(`Servidor rodando na porta ${config.server.port}`);
      logger.info(`Ambiente: ${config.server.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.server.port}/health`);
      logger.info('Bot Reativação Veterinária iniciado com sucesso!');
    });
  } catch (error) {
    logger.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
};

// Iniciar aplicação
startServer();
