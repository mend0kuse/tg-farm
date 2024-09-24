import { TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosError, AxiosInstance, HttpStatusCode, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { random, sleep, shuffleArray } from '../shared/utils';
import { telegramApi } from '../shared/telegram/telegram-api';
import { catsDatabase } from './database';

export class Cats {
    private account: TAccountData;
    private profile: any;
    private refCode: string;
    private telegramClient: TelegramClient;
    private logger: BaseLogger;
    private api: AxiosInstance;
    private API_URL = 'https://api.catshouse.club';
    private peer: null | tl.TypeInputPeer = null;
    private webDataUrl: null | string = null;
    private isCreated: boolean = false;

    constructor({
        account,
        refCode,
        isCreated,
        telegramClient,
    }: {
        account: TAccountData;
        refCode: string;
        telegramClient: TelegramClient;
        isCreated: boolean;
    }) {
        this.isCreated = isCreated;
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

    async start() {
        this.api
            .get('https://ifconfig.me/ip', {
                baseURL: '',
            })
            .then((response) => this.logger.log('IP =', response.data))
            .catch((error) => this.logger.error('Ошибка получения IP', this.handleError(error)));

        mainLoop: while (true) {
            const delayInMinutes = random(1, 10);
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

            await this.telegramClient.close();

            this.logger.accentLog(
                'Успешный логин. Начало прохода. \n',
                this.profile ? `Токены = ${this.profile.currentRewards}. \n` : ' '
            );

            if (!this.isCreated) {
                try {
                    await catsDatabase.createAccount({
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

            const actions = [this.completeTasks];

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
                await catsDatabase.updateTokensByIndex(this.account.index, this.profile.currentRewards);
            } catch (error) {
                this.logger.error('Ошибка обновления токенов:', error);
            }

            this.logger.accentLog('Конец прохода');
            return;
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
            const catsTasks = await this.getCatsTasks();

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
                        if (checked) {
                            const completed = await this.completeTask(id, title);
                            if (!completed) {
                                throw new Error('Не удалось выполнить задание');
                            }

                            this.logger.log('Успешно выполнено задание: ', task.title);
                        } else {
                            throw new Error('Не удалось проверить задание');
                        }
                    } catch (error) {
                        this.logger.error('Ошибка при изменении ника', this.handleError(error));
                    }
                }

                if (type === 'OPEN_LINK') {
                    const isSuccess = await this.completeTask(id, title);
                    if (isSuccess) {
                        this.logger.log('Успешно выполнено задание: ', task.title);
                    }
                }

                if (type === 'SUBSCRIBE_TO_CHANNEL') {
                    try {
                        const match = task.params.channelUrl.match(/https:\/\/t\.me\/([a-zA-Z0-9_]+)/);
                        if (match?.[1]) {
                            await telegramApi.joinChannel(this.telegramClient, match?.[1]);
                        } else {
                            throw new Error('Не удалось распарсить название');
                        }

                        // await telegramApi.joinChannel(this.telegramClient, task.params.channelId);

                        const isChecked = await this.checkTask(id, title);
                        if (isChecked) {
                            const completed = await this.completeTask(id, title);
                            if (!completed) {
                                throw new Error('Не удалось выполнить задание');
                            }
                        } else {
                            throw new Error('Не удалось проверить задание');
                        }

                        this.logger.log('Успешно выполнено задание: ', task.title);
                    } catch (error) {
                        this.logger.error('Ошибка при подключении к каналу', task.title, this.handleError(error));
                    }
                }
            }
        } catch (error) {
            this.logger.error('Ошибка выполнения заданий', this.handleError(error));
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
            return (await this.api.get('/tasks/user?group=daily')).data.tasks;
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
}
