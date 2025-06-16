import { config } from '@/config';

export default {
    getImgs(illust) {
        const images: string[] = [];
        if (illust.meta_pages?.length) {
            for (const page of illust.meta_pages) {
                const original = page.image_urls.original.replace('https://i.pximg.net', config.pixiv.imgProxy);
                images.push(`<img style="display: block;" src="${original}" width="${page.width}" height="${page.height}"/>`);
            }
        } else if (illust.meta_single_page.original_image_url) {
            const original = illust.meta_single_page.original_image_url.replace('https://i.pximg.net', config.pixiv.imgProxy);
            images.push(`<img style="display: block;" src="${original}" width="${illust.width}" height="${illust.height}"/>`);
        }
        return images;
    },
    getProxiedImageUrl(originalUrl: string): string {
        return originalUrl.replace('https://i.pximg.net', config.pixiv.imgProxy || '');
    },
};
