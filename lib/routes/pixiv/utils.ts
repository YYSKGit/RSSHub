import { config } from '@/config';

export default {
    getImgs(illust) {
        const images: string[] = [];
        if (illust.meta_pages?.length) {
            for (const page of illust.meta_pages) {
                const large = page.image_urls.large.replace('https://i.pximg.net', config.pixiv.imgProxy);
                images.push(`<img src="${this.getImageUrlWithKey(large)}" style="max-width: 100%; height: auto;"/>`);
            }
        } else if (illust.meta_single_page.original_image_url) {
            const original = illust.meta_single_page.original_image_url.replace('https://i.pximg.net', config.pixiv.imgProxy);
            images.push(`<img src="${this.getImageUrlWithKey(original)}" style="max-width: 100%; height: auto;"/>`);
        }
        return images;
    },
    getImgUrls(illust) {
        const urls: string[] = [];
        if (illust.meta_pages?.length) {
            for (const page of illust.meta_pages) {
                const large = page.image_urls.large.replace('https://i.pximg.net', config.pixiv.imgProxy);
                urls.push(this.getImageUrlWithKey(large));
            }
        } else if (illust.meta_single_page.original_image_url) {
            const original = illust.meta_single_page.original_image_url.replace('https://i.pximg.net', config.pixiv.imgProxy);
            urls.push(this.getImageUrlWithKey(original));
        }
        return urls;
    },
    getProxiedImageUrl(originalUrl: string): string {
        return originalUrl.replace('https://i.pximg.net', config.pixiv.imgProxy || '');
    },
    getImageUrlWithKey(originalUrl: string): string {
        const mainDomain = 'yyskweb.com';
        const url = new URL(originalUrl ?? '');
        if (url.hostname === mainDomain || url.hostname.endsWith(`.${mainDomain}`)) {
            url.searchParams.append('key', process.env.ACCESS_KEY ?? '');
        }
        return url.href;
    },
};
