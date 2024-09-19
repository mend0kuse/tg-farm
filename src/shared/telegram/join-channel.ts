import { TelegramClient } from '@mtcute/node';

export const joinChannel = async (client: TelegramClient, channelName: string) => {
    const channel = await client.resolveChannel(channelName);

    return client.call({
        _: 'channels.joinChannel',
        channel,
    });
};
