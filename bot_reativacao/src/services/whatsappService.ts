import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { WhatsAppMessage } from '../types';

class WhatsAppService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.whatsapp.apiUrl,
      headers: {
        'apikey': config.whatsapp.apiToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Envia mensagem de texto via WhatsApp (Evolution API)
   */
  async sendMessage(phone: string, message: string): Promise<boolean> {
    try {
      // Formatar número de telefone (remover caracteres especiais)
      const cleanPhone = this.cleanPhoneNumber(phone);

      const payload = {
        number: cleanPhone,
        text: message,
      };

      logger.info('Enviando mensagem WhatsApp', { phone: cleanPhone });

      // Evolution API format: /message/sendText/{instance}
      const response = await this.client.post(
        `/message/sendText/${config.whatsapp.instanceId}`,
        payload
      );

      if (response.data.success || response.status === 200 || response.status === 201) {
        logger.info('Mensagem enviada com sucesso', { phone: cleanPhone });
        return true;
      } else {
        logger.error('Erro ao enviar mensagem', {
          phone: cleanPhone,
          response: response.data
        });
        return false;
      }
    } catch (error: any) {
      logger.error('Erro ao enviar mensagem WhatsApp', {
        phone,
        error: error.message,
        response: error.response?.data,
      });
      return false;
    }
  }

  /**
   * Envia mensagem com mídia (imagem, vídeo, etc) - Evolution API
   */
  async sendMediaMessage(
    phone: string,
    caption: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'document' = 'image'
  ): Promise<boolean> {
    try {
      const cleanPhone = this.cleanPhoneNumber(phone);

      const payload = {
        number: cleanPhone,
        mediatype: mediaType,
        mimetype: mediaType === 'image' ? 'image/jpeg' : 'application/pdf',
        caption: caption,
        media: mediaUrl,
      };

      logger.info('Enviando mensagem com mídia via WhatsApp', { phone: cleanPhone, mediaType });

      // Evolution API format: /message/sendMedia/{instance}
      const response = await this.client.post(
        `/message/sendMedia/${config.whatsapp.instanceId}`,
        payload
      );

      if (response.data.success || response.status === 200 || response.status === 201) {
        logger.info('Mensagem com mídia enviada com sucesso', { phone: cleanPhone });
        return true;
      } else {
        logger.error('Erro ao enviar mensagem com mídia', {
          phone: cleanPhone,
          response: response.data
        });
        return false;
      }
    } catch (error: any) {
      logger.error('Erro ao enviar mensagem com mídia via WhatsApp', {
        phone,
        error: error.message,
        response: error.response?.data,
      });
      return false;
    }
  }

  /**
   * Limpa número de telefone removendo caracteres especiais
   */
  private cleanPhoneNumber(phone: string): string {
    // Remove todos os caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '');

    // Se não começar com 55 (código do Brasil), adiciona
    if (!cleaned.startsWith('55') && cleaned.length >= 10) {
      cleaned = '55' + cleaned;
    }

    return cleaned;
  }

  /**
   * Verifica se o número de telefone é válido
   */
  isValidPhoneNumber(phone: string): boolean {
    const cleaned = this.cleanPhoneNumber(phone);
    // Número brasileiro válido deve ter 12 ou 13 dígitos (55 + DDD + número)
    return cleaned.length >= 12 && cleaned.length <= 13;
  }

  /**
   * Formata mensagem substituindo variáveis
   */
  formatMessage(template: string, variables: Record<string, string>): string {
    let formatted = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      formatted = formatted.replace(regex, value);
    });

    return formatted;
  }
}

export const whatsappService = new WhatsAppService();
