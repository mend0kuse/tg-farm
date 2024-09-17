import axios from 'axios';
import { APP_CONFIG } from '../../config';
import { baseLogger } from '../logger';

export const sendBotNotification = async (message: string, chatId = APP_CONFIG.MASTER_USER_ID) => {
    try {
        await axios.post(
            `https://api.telegram.org/bot${APP_CONFIG.NOTIFICATION_BOT_TOKEN}/sendMessage`,
            {
                chat_id: chatId,
                text: message,
            },
        );
    } catch (error) {
        baseLogger.error('Error sending Telegram notification:', error);
    }
};
