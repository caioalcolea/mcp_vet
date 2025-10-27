import { Pool, PoolConfig } from 'pg';
import { config } from './index';
import { logger } from '../utils/logger';

class Database {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    try {
      const poolConfig: PoolConfig = {
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        max: 10, // Máximo de conexões no pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };

      this.pool = new Pool(poolConfig);

      // Testar conexão
      const client = await this.pool.connect();
      logger.info('Conectado ao banco de dados PostgreSQL');
      client.release();

      // Event handlers
      this.pool.on('error', (err) => {
        logger.error('Erro inesperado no pool de conexões PostgreSQL:', err);
      });
    } catch (error) {
      logger.error('Erro ao conectar ao banco de dados:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Pool de conexões não inicializado');
    }
    return this.pool;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Pool de conexões não inicializado');
    }

    try {
      const result = await this.pool.query(sql, params);
      return result.rows as T[];
    } catch (error: any) {
      // Extract relevant error properties for better logging
      const errorInfo = {
        message: error.message || String(error),
        code: error.code,
        detail: error.detail,
        constraint: error.constraint,
        table: error.table,
      };
      logger.error('Erro ao executar query:', { sql, error: errorInfo });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('Desconectado do banco de dados');
    }
  }
}

export const database = new Database();
