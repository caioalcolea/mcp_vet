import mysql from 'mysql2/promise';
import { config } from './index';
import { logger } from '../utils/logger';

class Database {
  private pool: mysql.Pool | null = null;

  async connect(): Promise<void> {
    try {
      this.pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });

      // Testar conexão
      await this.pool.getConnection();
      logger.info('Conectado ao banco de dados MySQL');
    } catch (error) {
      logger.error('Erro ao conectar ao banco de dados:', error);
      throw error;
    }
  }

  getPool(): mysql.Pool {
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
      const [rows] = await this.pool.execute(sql, params);
      return rows as T[];
    } catch (error) {
      logger.error('Erro ao executar query:', { sql, error });
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
