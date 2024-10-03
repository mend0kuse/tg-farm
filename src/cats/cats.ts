import { TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosError, AxiosInstance, HttpStatusCode, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { random, sleep, shuffleArray } from '../shared/utils';
import { telegramApi } from '../shared/telegram/telegram-api';
import { APP_CONFIG } from '../config';
import { CatsDatabase } from './database';
import { fromNano, toNano, SendMode, internal, beginCell } from '@ton/core';
import { tonUtility } from '../shared/ton/ton-utility';

export class Cats {
    private account: TAccountData;
    private database: CatsDatabase;
    private profile: any;
    private refCode: string;
    private telegramClient: TelegramClient;
    private logger: BaseLogger;
    private api: AxiosInstance;
    private API_URL = 'https://api.catshouse.club';
    private peer: null | tl.TypeInputPeer = null;
    private webDataUrl: null | string = null;
    private isCreated: boolean = false;
    private daily: any;
    private externalData: {
        channelsNameByUrl: Record<string, string>;
    } | null = null;

    constructor({
        account,
        refCode,
        isCreated,
        telegramClient,
        database,
    }: {
        account: TAccountData;
        refCode: string;
        telegramClient: TelegramClient;
        isCreated: boolean;
        database: CatsDatabase;
    }) {
        this.isCreated = isCreated;
        this.database = database;
        this.account = account;
        this.refCode = refCode;
        this.telegramClient = telegramClient;
        this.logger = new BaseLogger(`CATS_${account.index}`);

        const agent = account.proxy ? new SocksProxyAgent(account.proxy) : undefined;
        this.api = axios.create({
            httpAgent: agent,
            httpsAgent: agent,
            baseURL: this.API_URL,
            headers: {
                accept: '*/*',
                'content-type': 'application/json',
                'accept-language': 'en-US;q=0.8,en;q=0.7',
                'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site',
                'User-Agent': account.userAgent,
                priority: 'u=1, i',
                Origin: 'https://cats-frontend.tgapps.store/',
                Referer: 'https://cats-frontend.tgapps.store/',
            },
        });
    }

    async sendTrx() {
        if (this.isTransactionCompleted) {
            this.logger.log('Транзакция уже выполнена');
            return;
        }

        if (!this.profile.id) {
            this.logger.error('Ошибка отправки транзакции. Не найден profile.id=', this.profile.id);
            return;
        }

        try {
            const balance = await tonUtility.getBalanceByMnemonic(this.account.mnemonicTon.split(' '));

            this.logger.log(
                `Адрес: ${await tonUtility.getWalletAddress(this.account.mnemonicTon.split(' '))}
                Баланс на кошельке: ${fromNano(balance)} ton`
            );

            if (balance <= toNano('0.2')) {
                this.logger.log('Недостаточно баланса для транзакции');
                return;
            }

            const keyPair = await tonUtility.getKeyPair(this.account.mnemonicTon.split(' '));
            const wallet = await tonUtility.getWalletContract(this.account.mnemonicTon.split(' '));
            const contract = tonUtility.contractAdapter.open(wallet);

            await sleep(random(1, 2));

            await contract.sendTransfer({
                sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
                seqno: await contract.getSeqno(),
                secretKey: keyPair.secretKey,
                messages: [
                    internal({
                        value: '0.2',
                        to: 'UQD-jP8E5q6n8GGOjIVQvq9JmTlQ25XLZQdGuWZfQ90Tjfp5',
                        body: beginCell().storeUint(0, 32).storeStringTail(`${this.profile.id}:65`).endCell(),
                    }),
                ],
            });

            this.logger.log('Ожидание выполнения транзакции. 60-90 секунд...');
            await sleep(random(60, 90));
        } catch (error) {
            this.logger.error('Ошибка отправки транзакции:', this.handleError(error));
        }
    }

    async start() {
        this.api
            .get('https://ifconfig.me/ip', {
                baseURL: '',
            })
            .then((response) => this.logger.log('IP =', response.data))
            .catch((error) => this.logger.error('Ошибка получения IP', this.handleError(error)));

        mainLoop: while (true) {
            const delayInMinutes = random(1, 120);
            this.logger.log(`Задержка ${delayInMinutes} минут перед стартом прохода...`);
            await sleep(delayInMinutes * 60);

            let loginAttempts = 0;
            loginLoop: while (true) {
                try {
                    await this.login();
                    break loginLoop;
                } catch (error) {
                    if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) {
                        this.logger.error('FLOOD WAIT', error.seconds * 2);
                        await sleep(error.seconds * 2);
                        throw new Error('FLOOD');
                    }

                    if (loginAttempts > 5) {
                        throw new Error('5 Неудачных логинов');
                    }

                    this.logger.error('Неудачный логин, задержка...', this.handleError(error));
                    await sleep(random(100, 150));
                    loginAttempts++;

                    continue loginLoop;
                }
            }

            if (!this.profile) {
                this.logger.error('Профиль не найден');
                continue mainLoop;
            }

            this.logger.accentLog(
                'Успешный логин. Начало прохода. \n',
                this.profile ? `Токены = ${this.profile.currentRewards}. \n` : ' '
            );

            if (!this.isCreated) {
                try {
                    this.database.createAccount({
                        index: this.account.index,
                        tokens: this.profile.currentRewards,
                        refCode: this.profile.referrerCode,
                    });
                    this.isCreated = true;
                    this.logger.error('Успешно добавлен в базу');
                } catch (error) {
                    this.logger.error('Ошибка добавления в базу', error);
                }
            }

            await sleep(random(5, 10));
            await this.getExternalData();
            await this.getDailyTasks();

            const actions = [this.completeTasks, this.sendTrx, this.checkEligibility];

            shuffleArray(actions);

            for (const promise of actions) {
                try {
                    await sleep(random(5, 10));
                    await promise.call(this);
                    await sleep(random(1, 4));
                    await this.sync();
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                this.database.updateTokensByIndex(this.account.index, this.profile.currentRewards);
            } catch (error) {
                this.logger.error('Ошибка обновления токенов:', error);
            }

            this.logger.accentLog('Конец прохода');
            return;
        }
    }

    async checkEligibility() {
        try {
            const res = await this.api.get('exchange-claim/check-available');
            const isEligible = Object.values(res.data).some(Boolean);
            this.logger.accentLog('Статус дропа = ', isEligible);
        } catch (error) {
            this.logger.error('Ошибка проверки дропа', this.handleError(error));
        }
    }

    async login() {
        try {
            this.logger.log('Старт логина');

            if (!this.webDataUrl) {
                this.webDataUrl = await this.getWebAppDataUrl();
            }

            this.logger.log('Успешный resolvePeer');

            this.api.defaults.headers['Authorization'] = `tma ${telegramApi.extractWebAppData(this.webDataUrl)}`;

            const result = await this.api.get('/user');
            this.profile = result.data;

            this.logger.log('Успешный логин');
        } catch (_error) {
            const error = _error as AxiosError;
            if (error.status === HttpStatusCode.NotFound) {
                this.logger.log('Пользователь не найден. Создаем..');
                await this.createUser();
                return;
            }

            throw _error;
        }
    }

    async sync() {
        try {
            const result = await this.api.get('/user');
            this.profile = result.data;

            this.logger.log('Успешный sync');
        } catch (error) {
            this.logger.error('Ошибка синхронизации:', this.handleError(error));
        }
    }

    async completeTasks() {
        this.logger.log('Прохождение заданий');

        try {
            let isFlooded = false;
            const catsTasks = await this.getCatsTasks();
            this.logger.log('Найдено невыполненных заданий = ', catsTasks.filter((tsk: any) => !tsk.completed).length);

            for (const task of catsTasks) {
                if (task.completed) {
                    continue;
                }

                await sleep(random(5, 10));

                const id = task.id;
                const title = task.title;
                const type:
                    | 'SUBSCRIBE_TO_CHANNEL'
                    | 'OPEN_LINK'
                    | 'NICKNAME_CHANGE'
                    | 'ACTIVITY_CHALLENGE'
                    | 'BOOST_CHANNEL'
                    | 'INVITE_FRIENDS' = task.type;

                if (type === 'NICKNAME_CHANGE') {
                    try {
                        await telegramApi.updateProfile(this.telegramClient, {
                            lastName: task.params.nicknamePart,
                        });

                        const checked = await this.checkTask(id, title);
                        if (!checked) {
                            throw new Error('Не удалось проверить задание');
                        }

                        this.logger.log('Успешно выполнено задание: ', task.title);
                    } catch (error) {
                        this.logger.error('Ошибка при изменении ника', this.handleError(error));
                    }
                }

                if (type === 'OPEN_LINK') {
                    try {
                        const isSuccess = await this.completeTask(id, title);
                        if (!isSuccess) {
                            throw new Error('isSuccess=false');
                        }

                        this.logger.log('Успешно выполнено задание: ', task.title);
                    } catch (error) {
                        this.logger.error('Ошибка при открытии ссылки:', this.handleError(error));
                    }
                }

                if (type === 'SUBSCRIBE_TO_CHANNEL' && !isFlooded) {
                    try {
                        const channelName = await this.getChannelNameFromUniqueLink(task.params.channelUrl);
                        if (!channelName) {
                            throw new Error('Не удалось найти channelName');
                        }

                        await sleep(random(60, 120));

                        await telegramApi.joinChannel(this.telegramClient, channelName);

                        const isChecked = await this.checkTask(id, title);
                        if (!isChecked) {
                            throw new Error('Не удалось проверить задание');
                        }

                        this.logger.log('Успешно выполнено задание: ', title);
                    } catch (error) {
                        if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) {
                            await sleep(error.seconds * 2);
                            await telegramApi.sendBotNotification(
                                `[CATS_${this.account.index}], Флуд на вступление в канал`
                            );

                            isFlooded = true;
                        }

                        this.logger.error('Ошибка при подключении к каналу: ', title, this.handleError(error));
                    }
                }
            }
        } catch (error) {
            this.logger.error('Ошибка выполнения заданий', this.handleError(error));
        }
    }

    async getChannelNameFromUniqueLink(url: string) {
        const match = url.match(/https:\/\/t\.me\/([a-zA-Z0-9_]+)/);

        if (match?.[1]) {
            return match[1];
        }

        const founded = this.externalData?.channelsNameByUrl[url] ?? '';

        if (founded) {
            return founded;
        }

        if (this.externalData?.channelsNameByUrl) {
            await telegramApi.sendBotNotification(`[CATS_${this.account.index}] Нужен username для канала: ` + url);
        }

        return null;
    }

    async checkAndCompleteTask(id: number | string, title?: string) {
        const isChecked = await this.checkTask(id, title);
        if (!isChecked) {
            throw new Error('Не удалось проверить задание');
        }

        const completed = await this.completeTask(id, title);
        if (!completed) {
            throw new Error('Не удалось выполнить задание');
        }
    }

    async getExternalData() {
        try {
            this.logger.log('Получение внешних данных...');
            const { data } = await axios.get(APP_CONFIG.EXTERNAL_DATA_URL_CATS);

            this.externalData = data.data;
        } catch (error) {
            this.logger.error('Ошибка получения внешних данных!', this.handleError(error));
        }
    }

    async getAvatar() {
        try {
            const result = await this.api.get(`/user/avatar`);
            return result.data;
        } catch (error) {
            this.logger.error('Ошибка получения аватара', this.handleError(error));
            throw error;
        }
    }

    async createUser() {
        try {
            const result = await this.api.post(`/user/create/?referral_code=${this.refCode}`);

            this.profile = result.data;
            this.logger.log('Пользователь зареган успешно');
        } catch (error) {
            this.logger.error('Ошибка создания пользователя', this.handleError(error));
            throw error;
        }
    }

    async completeTask(id: string | number, title?: string) {
        try {
            const result = await this.api.post(`tasks/${id}/complete`, {});
            if (!result.data.success) {
                throw new Error('Ошибка при выполнении');
            }
            return true;
        } catch (error) {
            this.logger.error('Ошибка выполнения задания', title ?? id, this.handleError(error));
            return false;
        }
    }

    async checkTask(id: string | number, title?: string) {
        try {
            const result = await this.api.post(`tasks/${id}/check`, {});
            if (!result.data.completed) {
                throw new Error('Не выполнено');
            }

            return true;
        } catch (error) {
            this.logger.error('Ошибка проверки задания', title ?? id, this.handleError(error));
            return false;
        }
    }

    async getWebAppDataUrl() {
        if (!this.peer) {
            this.peer = await this.telegramClient.resolvePeer('catsgang_bot');
        }

        try {
            const response = await this.telegramClient.call({
                _: 'messages.requestAppWebView',
                peer: this.peer,
                app: {
                    _: 'inputBotAppShortName',
                    botId: toInputUser(this.peer),
                    shortName: 'join',
                },
                platform: 'Android',
                startParam: this.refCode,
                writeAllowed: true,
            });

            return response.url;
        } catch (error) {
            this.peer = null;
            throw error;
        }
    }

    async getDailyTasks() {
        try {
            this.daily = (await this.api.get('/tasks/user?group=daily')).data.tasks;
        } catch (error) {
            this.logger.error('Ошибка получения заданий', this.handleError(error));
        }
    }
    async getCatsTasks() {
        try {
            return (await this.api.get('/tasks/user?group=cats')).data.tasks;
        } catch (error) {
            this.logger.error('Ошибка получения заданий', this.handleError(error));
        }
    }

    // ---- HELPERS ----

    handleError(error: unknown) {
        if (isAxiosError(error)) {
            return `Axios error: ${error.status} ${error.code} ${error.message} `;
        } else {
            return error as string;
        }
    }

    get isTransactionCompleted() {
        try {
            const task = this.daily.find((task: any) => task.type === 'TON_TRANSACTION');
            return task.timesCompleted > 0;
        } catch {
            return true;
        }
    }
}
