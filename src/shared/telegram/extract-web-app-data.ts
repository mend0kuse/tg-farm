export const extractWebAppData = (url: string) => {
    return new URLSearchParams(new URL(url).hash.substring(1)).get('tgWebAppData') ?? '';
};
