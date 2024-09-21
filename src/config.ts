import 'dotenv/config';

const BYBIT_IS_MAINNET = Boolean(+(process.env.BYBIT_IS_MAINNET ?? 0));

export const APP_CONFIG = {
    // ---- TG ----

    API_CLIENT_ID: Number(process.env.API_CLIENT_ID),
    API_CLIENT_HASH: process.env.API_CLIENT_HASH ?? '',

    // ---- TON ----

    TON_API_KEY: process.env.TON_API_KEY ?? '',

    // ---- EXTERNAL ----

    EXTERNAL_DATA_URL: process.env.EXTERNAL_DATA_URL ?? '',

    // ---- NOTIFICATIONS ----

    MASTER_USER_ID: process.env.MASTER_USER_ID,
    NOTIFICATION_BOT_TOKEN: process.env.NOTIFICATION_BOT_TOKEN,

    // ---- BYBIT ----

    BYBIT_IS_MAINNET,
    BYBIT_KEY: BYBIT_IS_MAINNET ? (process.env.BYBIT_KEY ?? '') : (process.env.BYBIT_KEY_TESTNET ?? ''),
    BYBIT_SECRET: BYBIT_IS_MAINNET ? (process.env.BYBIT_SECRET ?? '') : (process.env.BYBIT_SECRET_TESTNET ?? ''),

    // ----  WALLETS ADDRESSES ----

    ETH_ADDRESS: process.env.ETH_ADDRESS ?? '',
};
