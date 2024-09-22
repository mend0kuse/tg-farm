import { TAccountData } from '../accounts-generator';
import { REFERRAL_MAP } from '../constants';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, random, sleep } from '../shared/utils';
import { xrumDatabase } from './database';
import { Xrum } from './xrum';

export const runHrumWorker = async (user: TAccountData) => {
    let errors = 0;

    const refererIndex = REFERRAL_MAP[user.index];
    let refCode = 'ref';
    let isCreated = false;

    while (errors < 5) {
        while (true) {
            const myAccount = await xrumDatabase.findByIndex(user.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            const refererAccount = await xrumDatabase.findByIndex(refererIndex);
            if (refererAccount) {
                refCode += refererAccount.tgId;
                break;
            }

            baseLogger.accentLog(`[XRUM_${user.index}] В базе не найден аккаунт referer. Задержка 10 минут...`);
            await sleep(60 * 10);
        }

        const { telegramClient } = await telegramApi.createClientBySession({
            session: user.session,
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
        });

        try {
            const hrum = new Xrum({
                telegramClient,
                account: user,
                refCode,
                isCreated,
            });

            await hrum.start();
            await sleep(hrum.secondsUntilUTCHour(7));
            baseLogger.log('[HRUM] Применена задержка до следующего круга');
        } catch (error) {
            errors++;
            baseLogger.error('[HRUM] WORKER ERROR', error);

            await telegramApi.sendBotNotification(`[HRUM]. Воркер ${user.index}. Ошибка #${errors}. ${error}`);
            await sleep(random(120, 180));
        }
    }
};
