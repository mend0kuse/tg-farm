import { TelegramClient } from '@mtcute/node';
import { APP_CONFIG } from '../../config';
import { TSocks5Proxy, terminalPrompt } from '../utils';
import { SocksTcpTransport } from '@mtcute/socks-proxy';

export const createTelegramClientBySession = async (args?: {
    session?: string;
    sessionName?: string;
    proxy?: TSocks5Proxy | null;
}) => {
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

    const sessionResult = await tg.exportSession();
    // baseLogger.log('session', session);

    return { telegramClient: tg, sessionResult };
};
