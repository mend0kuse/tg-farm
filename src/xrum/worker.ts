import { TAccountData } from '../accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, random, sleep } from '../shared/utils';
import { Xrum } from './xrum';

export const runHrumWorker = async (user: TAccountData & { refCode: string }) => {
    let errors = 0;

    while (errors < 5) {
        const { telegramClient } = await telegramApi.createClientBySession({
            session: user.session,
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
        });

        try {
            const hrum = new Xrum({
                telegramClient,
                account: user,
                refCode: user.refCode,
            });

            await hrum.start();
            await sleep(hrum.secondsUntilUTCHour(7));
            baseLogger.log('[HRUM] Применена задержка до следующего круга');
        } catch (error) {
            errors++;
            baseLogger.error('[HRUM] WORKER ERROR', error);

            await telegramApi.sendBotNotification(`[HRUM]. Воркер ${user.index}. Ошибка по флуду #${errors}.`);
            await sleep(random(30, 60));
        }
    }
};
