import { TAccountData } from '../accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, sleep, random } from '../shared/utils';
import { XEmpire } from './xempire';

export const runEmpireWorker = async (user: TAccountData & { refCode: string }) => {
    let cycle = 1;

    while (cycle < 6) {
        const { telegramClient } = await telegramApi.createClientBySession({
            session: user.session,
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
        });

        try {
            await new XEmpire({
                telegramClient,
                index: user.index,
                ua: user.userAgent,
                proxy: user.proxy,
                mnemonic: user.mnemonicTon,
                refCode: user.refCode,
            }).start();
        } catch (error) {
            baseLogger.error(error);
        }

        baseLogger.log(`EMPIRE ${user.index} прервался. Круг ${cycle}`);

        await sleep(random(120, 140));
        cycle++;
    }
};
