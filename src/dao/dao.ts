import { Long, TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { random, sleep, shuffleArray } from '../shared/utils';
import { telegramApi } from '../shared/telegram/telegram-api';
import { DaoDatabase } from './database';
import { DAO_FOUNDERS, DAO_SCHEDULE, REFERRAL_MAP_DAO } from './ref';
import { Centrifuge } from 'centrifuge';
import WebSocket from 'ws';
import { EventBus, EventBusEvents } from '../shared/event-bus';
import { clearInterval } from 'timers';

export class Dao {
    private account: TAccountData;
    private usersEventBus: EventBus<EventBusEvents>;
    private database: DaoDatabase;
    private refCode: string;
    private telegramClient: TelegramClient;
    private logger: BaseLogger;
    private api: AxiosInstance;
    private analyticsApi: AxiosInstance;
    private isCreated: boolean = false;
    private profile: any;
    private friendsInfo: any;
    private dailyInfo: any;
    private centrifuge: any;
    private daoInfo: any;
    private syncInterval: any;
    private daoWsChannel: any;

    constructor({
        account,
        refCode,
        isCreated,
        telegramClient,
        database,
        usersEventBus,
    }: {
        account: TAccountData;
        refCode: string;
        telegramClient: TelegramClient;
        isCreated: boolean;
        database: DaoDatabase;
        usersEventBus: EventBus<EventBusEvents>;
    }) {
        this.isCreated = isCreated;
        this.database = database;
        this.account = account;
        this.refCode = refCode;
        this.telegramClient = telegramClient;
        this.logger = new BaseLogger(`DAO_${account.index}`);
        this.usersEventBus = usersEventBus;

        this.createDaoApi();
        this.createAnalyticsApi();
    }

    async start() {
        this.api
            .get('https://ifconfig.me/ip', {
                baseURL: '',
            })
            .then((response) => this.logger.log('IP =', response.data))
            .catch((error) => this.logger.error('Ошибка получения IP', this.handleError(error)));

        let cycle = 1;
        mainLoop: while (true) {
            const joinedUsers = [];
            const delayInMinutes = (() => {
                if (!this.isPassiveUser) {
                    return this.nextTimeStart;
                }

                return cycle === 1 ? random(1, 120) : random(8, 12) * 60;
            })();

            this.logger.log(`Задержка ${delayInMinutes} минут перед стартом прохода...`);
            if (this.isDaoFounder) {
                await sleep((delayInMinutes - 1) * 60);
            } else {
                await sleep(delayInMinutes * 60);
            }

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

            await this.getInitialData();

            await this.setupCentrifuge();

            const unsubscribeFromStartDao = this.usersEventBus.subscribe({
                eventType: `joinDaoRoom${this.myDaoFounder}`,
                callback: async ({ user }) => {
                    if (!this.isDaoFounder) {
                        return;
                    }

                    this.logger.log(`${user} зашел в дао`);
                    joinedUsers.push(user);

                    if (joinedUsers.length === 5) {
                        this.logger.accentLog('Все зашли. Старт');
                        await sleep(5);
                        this.usersEventBus.publish({
                            eventType: `startDaoTouch${this.myDaoFounder}`,
                            payload: null,
                        });
                    }
                },
                isClearAfterCall: false,
            });

            if (!this.profile) {
                this.logger.error('Профиль не найден');
                continue mainLoop;
            }

            const daoCode = this.profile.dao_link.split('start=')[1];
            const refCode = this.profile.referral_link.split('start=')[1];
            const myRefCode = this.isDaoFounder ? daoCode : refCode;

            if (!this.isCreated) {
                try {
                    this.database.createAccount({
                        index: this.account.index,
                        tokens: this.profile.coins,
                        friends: 0,
                        refCode: myRefCode,
                    });

                    this.isCreated = true;
                    this.logger.error('Успешно добавлен в базу');
                } catch (error) {
                    this.logger.error('Ошибка добавления в базу', error);
                }
            }

            if (!this.isPassiveUser) {
                try {
                    await this.runTouches();
                    this.logger.accentLog('RUN TOUCHES окончен');
                } catch (error) {
                    this.logger.error('Ошибка при тапа:', this.handleError(error));
                }
            }

            const actions = [this.completeTasks, this.getFriends, this.createDao];

            shuffleArray(actions);

            for (const promise of actions) {
                try {
                    await sleep(random(5, 10));
                    await promise.call(this);
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                this.database.updateByIndex({
                    index: this.account.index,
                    tokens: this.profile.coins,
                    friends: this.friendsInfo.referees_count,
                    refCode: myRefCode,
                });
            } catch (error) {
                this.logger.error('Ошибка обновления аккаунта:', error);
            }

            clearInterval(this.syncInterval);
            this.centrifuge?.disconnect();
            unsubscribeFromStartDao();

            this.logger.accentLog('Конец прохода');
            cycle++;
        }
    }

    async getInitialData() {
        await Promise.allSettled([this.getTasks(), this.getDaily(), this.getNow(), this.getDaoUsers()]);

        this.logger.log('Получены начальные данные');
    }
    // ---- ACTIONS ----

    async login() {
        this.logger.log('Старт логина');

        const { url } = await this.getWebAppData();

        await this.sendPageView(url);

        this.logger.log('Успешный resolvePeer');

        const { access_token } = (
            await this.api.post('/login/web-app', {
                initData: telegramApi.extractWebAppData(url),
            })
        ).data;

        this.api.defaults.headers['Authorization'] = `Bearer ${access_token}`;

        await this.getProfile();
        this.logger.log('Успешный логин');
    }

    async claimDaily() {
        if (!this.dailyInfo.is_available) {
            this.logger.log('Клейм дейли недоступен');
            return;
        }

        try {
            await this.api.post('/tasks/daily/claim');
            this.logger.log('Успешный клейм дейли');
        } catch (error) {
            this.logger.error('Ошибка claimDaily:', this.handleError(error));
        }
    }

    async completeTasks() {
        await this.sendPageView('https://app.production.tonxdao.app/tasks');
        const tasks = await this.getTasks();

        await sleep(random(1, 10));
        await this.claimDaily();

        shuffleArray(tasks);

        for (const { is_active, is_completed, is_started, is_claimed, id, name } of tasks) {
            if (!is_active || is_claimed) {
                continue;
            }

            try {
                if (!is_started) {
                    await sleep(random(2, 5));
                    await this.startTask(id, name);
                }

                if (is_completed) {
                    await sleep(random(2, 5));
                    await this.claimTask(id, name);
                }
            } catch (error) {
                this.logger.error('Ошибка выполнения задания', this.handleError(error));
            }
        }
    }

    async claimTask(id: string, title?: string) {
        try {
            await this.api.post(`/tasks/${id}/claim`);
            this.logger.log('Успешный claim задания ', title);
        } catch (error) {
            this.logger.error('Ошибка клейма задания', title, this.handleError(error));
            throw error;
        }
    }

    async startTask(id: string, title?: string) {
        try {
            await this.sendPageView('https://app.production.tonxdao.app/tasks/modal');
            await this.api.post(`/tasks/${id}/start`);

            this.logger.log('Успешный start задания ', title);
        } catch (error) {
            this.logger.error('Ошибка старта задания', title, this.handleError(error));
            throw error;
        }
    }

    async createDao() {
        if (this.daoInfo.id) {
            this.logger.log('Уже в dao');
            return;
        }

        if (!this.isDaoFounder) {
            this.logger.log('Не founder');
            return;
        }

        try {
            this.sendPageView('https://app.production.tonxdao.app/modal/newdao');
            await this.api.post('/new_dao');
            await this.getDaoUsers();
            this.logger.log('Успешный вступил в dao');
        } catch (error) {
            this.logger.error('Ошибка создания DAO:', this.handleError(error));
        }
    }

    // ---- FETCHERS ----

    async getDaoUsers() {
        try {
            this.daoInfo = (await this.api.get('/dao_users')).data;
            this.logger.log('Успешный получил инфу о дао');
        } catch (error) {
            this.logger.error('Ошибка получения пользователей DAO:', this.handleError(error));
        }
    }

    async getNow() {
        try {
            await this.api.get('/time');
            this.logger.log('Успешный получен now');
        } catch (error) {
            this.logger.error('Ошибка получения времени:', this.handleError(error));
        }
    }

    async startDaoTouch() {
        let resolve: (value?: unknown) => void, reject: (reason?: any) => void;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        let errors = 0;

        const publishInterval = setInterval(() => {
            this.daoWsChannel.publish({}).catch((err: any) => {
                if (errors > 20) {
                    reject('Больше 20 ошибок publish');
                }
                this.logger.error('publish error', err);
                errors++;
            });
        }, 500);

        this.usersEventBus.subscribe({
            eventType: `stopDaoTouch${this.myDaoFounder}`,
            callback: () => {
                clearInterval(publishInterval);
                resolve();
            },
            isClearAfterCall: true,
        });

        return promise;
    }

    async runTouches() {
        let resolve: (value?: unknown) => void, reject: (reason?: any) => void;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        let checkAttempts = 0;
        const checkInterval = setInterval(() => {
            if (checkAttempts > 100) {
                clearInterval(checkInterval);
                reject('Не удалось дождаться старта дао');
                return;
            }

            this.logger.log('Проверка начала дао');
            checkAttempts++;
        }, 10000);

        this.usersEventBus.publish({
            eventType: `joinDaoRoom${this.myDaoFounder}`,
            payload: { user: this.account.index },
        });

        this.usersEventBus.subscribe({
            eventType: `startDaoTouch${this.myDaoFounder}`,
            callback: async () => {
                if (this.isDaoFounder) {
                    this.logger.log('Старт дао');
                }

                clearInterval(checkInterval);
                try {
                    await this.startDaoTouch();
                    resolve();
                    this.logger.log('Успешно окончил тап');
                } catch (error) {
                    this.logger.error('Ошибка старта дао:', error);
                    reject(error);
                }
            },
        });

        return promise;
    }

    async setupCentrifuge() {
        try {
            const { token } = (await this.api.get('/centrifugo-token')).data;

            this.logger.log('Получен токен ws');

            const agent = this.httpAgent;

            this.centrifuge = new Centrifuge('wss://ws.production.tonxdao.app/ws', {
                token,
                websocket: class extends WebSocket {
                    constructor(url: string) {
                        super(url, { agent });
                    }
                },
            });

            this.daoWsChannel = this.centrifuge.newSubscription(`dao:${this.daoInfo.id}`);

            this.daoWsChannel.subscribe();
            this.centrifuge.connect();

            this.centrifuge.on('connected', () => {
                this.logger.log('Успешно установлено соединение ws');
            });

            let rpcError = 0;

            let stopSendedTimes = 0;
            this.syncInterval = setInterval(() => {
                this.centrifuge.rpc('sync').then(
                    (res: any) => {
                        const { energy } = res.data;
                        if (energy <= 0 && stopSendedTimes < 5) {
                            this.usersEventBus.publish({
                                eventType: `stopDaoTouch${this.myDaoFounder}`,
                                payload: null,
                            });

                            stopSendedTimes++;
                        }
                    },
                    (err: any) => {
                        if (rpcError > 20) {
                            clearInterval(this.syncInterval);
                            return;
                        }

                        this.logger.log('RPC ERROR', err);
                        rpcError++;
                    }
                );
            }, 1000);
        } catch (error) {
            this.logger.error('Ошибка подключения к centrifugo', this.handleError(error));
        }
    }

    async getWebAppData() {
        const peer = await this.telegramClient.resolvePeer('tonxdao_bot');

        if (!this.isCreated) {
            await this.telegramClient.call({
                _: 'messages.startBot',
                peer,
                bot: toInputUser(peer),
                startParam: this.refCode,
                randomId: new Long(random(1, 1000000)),
            });
        }
        return this.telegramClient.call({
            _: 'messages.requestAppWebView',
            peer,
            app: {
                _: 'inputBotAppShortName',
                botId: toInputUser(peer),
                shortName: 'TONxDAO',
            },
            platform: 'Android',
            startParam: this.refCode,
            writeAllowed: true,
        });
    }

    async getFriends() {
        try {
            this.sendPageView('https://app.production.tonxdao.app/dao/invites');
            this.friendsInfo = (await this.api.get('/referrers')).data;
            this.logger.log('Успешный получен список друзей');
        } catch (error) {
            this.logger.error('Ошибка получения списка друзей:', this.handleError(error));
        }
    }

    async getProfile() {
        try {
            this.profile = (await this.api.get('/profile')).data;
            this.logger.log('Успешно получен профиль');
        } catch (error) {
            this.logger.error('Ошибка получения моего профиля:', this.handleError(error));
        }
    }

    async getDaily() {
        try {
            this.dailyInfo = (await this.api.get('/tasks/daily')).data;
            this.logger.log('Успешно получен daily');
        } catch (error) {
            this.logger.error('Ошибка получения списка заданий:', this.handleError(error));
        }
    }

    async getTasks() {
        try {
            return (await this.api.get('/tasks')).data;
        } catch (error) {
            this.logger.error('Ошибка получения списка заданий:', this.handleError(error));
            return [];
        }
    }

    // ---- HELPERS ----

    handleError(error: unknown) {
        if (isAxiosError(error)) {
            return `Axios error: ${error.status} ${error.code} ${error.message} ${JSON.stringify(error.response?.data)}`;
        } else {
            return error as string;
        }
    }

    get isDaoFounder() {
        return DAO_FOUNDERS.includes(this.account.index);
    }

    createDaoApi() {
        this.api = axios.create({
            httpAgent: this.httpAgent,
            httpsAgent: this.httpAgent,
            baseURL: 'https://app.production.tonxdao.app/api/v1',
            headers: this.sharedHeaders,
        });
    }

    get httpAgent() {
        return this.account.proxy ? new SocksProxyAgent(this.account.proxy) : undefined;
    }

    get sharedHeaders() {
        return {
            accept: '*/*',
            'accept-language': 'en-US;q=0.8,en;q=0.7',
            'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'User-Agent': this.account.userAgent,
            priority: 'u=1, i',
            Origin: 'https://app.production.tonxdao.app',
            Referer: 'https://app.production.tonxdao.app',
        };
    }

    async sendPageView(url: string) {
        this.logger.log('Отправка события plausible');

        try {
            await this.analyticsApi.post('/event', {
                n: 'pageview',
                u: url,
                d: 'production.tonxdao.app',
                r: null,
            });
        } catch (error) {
            this.logger.error('Ошибка отправки события plausible', this.handleError(error));
        }
    }

    createAnalyticsApi() {
        this.analyticsApi = axios.create({
            httpAgent: this.httpAgent,
            httpsAgent: this.httpAgent,
            baseURL: 'https://plausible.io/api',
            headers: this.sharedHeaders,
        });
    }

    get myDaoFounder() {
        if (this.isDaoFounder) {
            return this.account.index;
        }

        return REFERRAL_MAP_DAO[this.account.index];
    }

    get isPassiveUser() {
        return this.myDaoFounder == 0 || this.myDaoFounder == 1;
    }

    get mySchedule() {
        return DAO_SCHEDULE[this.myDaoFounder];
    }

    get nextTimeStart() {
        const now = new Date();
        const currentUtcHour = now.getUTCHours();
        const currentUtcMinutes = now.getUTCMinutes();

        const futureHours = this.mySchedule.filter((hour) => {
            return hour > currentUtcHour || (hour === currentUtcHour && currentUtcMinutes === 0);
        });

        const nextHour = (() => {
            if (futureHours.length > 0) {
                return futureHours[0];
            } else {
                now.setUTCDate(now.getUTCDate() + 1);
                return this.mySchedule[0];
            }
        })();

        now.setUTCHours(nextHour, random(1, 2), random(0, 60), random(0, 1000));

        return (now.getTime() - Date.now()) / 1000 / 60;
    }
}
