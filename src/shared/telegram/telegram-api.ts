import axios from 'axios';
import { APP_CONFIG } from '../../config';
import { baseLogger } from '../logger';
import { TelegramClient } from '@mtcute/node';
import { SocksTcpTransport, SocksProxyConnectionError } from '@mtcute/socks-proxy';
import { TSocks5Proxy, terminalPrompt } from '../utils';

export class TelegramApi {
    async sendBotNotification(message: string, chatId = APP_CONFIG.MASTER_USER_ID) {
        try {
            await axios.post(
                `https://api.telegram.org/bot${APP_CONFIG.NOTIFICATION_BOT_TOKEN}/sendMessage`,
                {
                    chat_id: chatId,
                    text: message,
                },
            );
        } catch (error) {
            baseLogger.error('Error sending Telegram notification:', error);
        }
    }

    async joinChannel(client: TelegramClient, channelName: string) {
        const channel = await client.resolveChannel(channelName);

        return client.call({
            _: 'channels.joinChannel',
            channel,
        });
    }

    extractWebAppData(url: string) {
        return new URLSearchParams(new URL(url).hash.substring(1)).get('tgWebAppData') ?? '';
    }

    async createClientBySession(args?: {
        session?: string;
        sessionName?: string;
        proxy?: TSocks5Proxy | null;
    }) {
        const { proxy, session = '', sessionName = '' } = args || {};

        const tg = new TelegramClient({
            apiId: APP_CONFIG.API_CLIENT_ID,
            apiHash: APP_CONFIG.API_CLIENT_HASH,
            storage: `sessions/${sessionName}.session`,
            logLevel: 1,
            initConnectionOptions: {
                appVersion: '2.0',
                deviceModel: 'Android',
                systemLangCode: 'en',
                systemVersion: '11',
            },
            transport: proxy
                ? () => {
                      return new SocksTcpTransport({
                          host: proxy?.ip,
                          port: proxy?.port,
                          password: proxy.password,
                          user: proxy?.login,
                          version: 5,
                      });
                  }
                : undefined,
        });

        await tg.start({
            phone: async () => await terminalPrompt('Phone > '),
            code: async () => await terminalPrompt('Code > '),
            password: async () => await terminalPrompt('Password > '),
        });

        tg.onError((err) => {
            if (this.isProxyError(err)) {
                return;
            }

            baseLogger.error(err);
        });

        const sessionResult = await tg.exportSession();

        return { telegramClient: tg, sessionResult };
    }

    isProxyError(err: unknown): err is SocksProxyConnectionError {
        return err instanceof SocksProxyConnectionError;
    }
}

export const telegramApi = new TelegramApi();
