import { TAccountData } from '../accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, sleep, random } from '../shared/utils';
import { xEmpireDatabase } from './database';
import { XEmpire } from './xempire';

export const runEmpireWorker = async (user: TAccountData) => {
    let cycle = 1;

    try {
        const savedAccount = await xEmpireDatabase.findByIndex(Number(user.index));
        if (!savedAccount) {
            await xEmpireDatabase.createAccount({ index: user.index, refCode: `hero${user.id}`, level: 1 });
            baseLogger.log(`EMPIRE ${user.index} успешно добавлен в базу.`);
        } else {
            baseLogger.log(`EMPIRE ${user.index} загружен из базы.}`);
        }
    } catch (error) {
        baseLogger.error(error);
    }

    while (cycle < 6) {
        const { telegramClient } = await telegramApi.createClientBySession({
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
            session: user.session,
        });

        try {
            await new XEmpire({
                telegramClient,
                index: user.index,
                ua: user.userAgent,
                proxy: user.proxy,
                mnemonic: user.mnemonicTon,
                refCode: '',
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
