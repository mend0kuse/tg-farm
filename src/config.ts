import 'dotenv/config';

export const APP_CONFIG = {
    API_CLIENT_ID: Number(process.env.API_CLIENT_ID),
    API_CLIENT_HASH: process.env.API_CLIENT_HASH ?? '',
    TON_API_KEY: process.env.TON_API_KEY ?? '',
    EXTERNAL_DATA_URL: process.env.EXTERNAL_DATA_URL ?? '',
    MASTER_USER_ID: process.env.MASTER_USER_ID,
    NOTIFICATION_CHAT_ID: process.env.NOTIFICATION_CHAT_ID,
    NOTIFICATION_BOT_TOKEN: process.env.NOTIFICATION_BOT_TOKEN,
};
