import { APP_CONFIG } from '../config';
import { REFERRAL_MAP_2 } from '../constants';
import { TAccountData } from '../scripts/accounts-generator';
import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, sleep, random } from '../shared/utils';
import { xEmpireDatabase } from './database';
import { XEmpire } from './xempire';

export const runEmpireWorker = async (user: TAccountData) => {
    const accounts = excelUtility.getAccounts();

    let cycle = 1;

    xEmpireDatabase.init();

    const refererIndex = REFERRAL_MAP_2[user.index];
    let refCode = `hero${APP_CONFIG.MASTER_USER_ID}`;
    let isCreated = false;

    while (true) {
        const myAccount = await xEmpireDatabase.findByIndex(user.index);
        if (myAccount) {
            isCreated = true;
            break;
        }

        if (refererIndex === 1) {
            break;
        }

        const refererAccount: any = await xEmpireDatabase.findByIndex(refererIndex);
        if (refererAccount) {
            const { id } = accounts.find((acc) => acc.index === refererIndex)!;
            refCode = `hero${id}`;
            break;
        }

        baseLogger.accentLog(`[XRUM_${user.index}] В базе не найден аккаунт referer. Задержка 5 минут...`);
        await sleep(60 * 5);
    }

    while (cycle < 6) {
        const { telegramClient } = await telegramApi.createClientBySession({
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
        });

        baseLogger.log(`[X_${user.index}] Телеграм клиент успешно создан`);

        try {
            await new XEmpire({
                telegramClient,
                index: user.index,
                ua: user.userAgent,
                proxy: user.proxy,
                mnemonic: user.mnemonicTon,
                database: xEmpireDatabase,
                refCode,
                isCreated,
            }).start();
        } catch (error) {
            baseLogger.error(error);
        }

        const message = `[X_${user.index}]. Воркер прервался. Круг ${cycle}`;
        await telegramApi.sendBotNotification(message);
        baseLogger.log(message);

        await telegramClient.close();
        await sleep(random(30 * 60, 60 * 60));
        cycle++;
    }
};
