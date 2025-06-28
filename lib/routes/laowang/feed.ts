import type { Route } from '@/types';
import got from '@/utils/got';
import * as cheerio from 'cheerio';
import parser from '@/utils/rss-parser';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';

export const route: Route = {
    path: '/feed/test',
    handler,
};

async function handler() {
    const feedUrl = 'https://laowang.vip/forum.php?mod=guide&view=newthread&rss=1';
    const feed = await parser.parseURL(feedUrl);
    const filteredItems = feed.items.filter((item) => item.categories.includes('国产自拍下载'));

    const baseUrl = 'https://laowang.vip';
    const userCookie = process.env.LAOWANG_COOKIE;
    const items = await Promise.all(
        filteredItems.map((item) =>
            cache.tryGet(item.link!, async () => {
                const response = await got({
                    method: 'get',
                    url: item.link,
                    headers: {
                        Cookie: userCookie,
                    },
                });

                const $ = cheerio.load(response.data);
                const content = $('div.t_fsz').first();
                content.find('font.jammer').remove();
                content.find('p.mbn:has(a[href*="mod=attachment&aid="])').remove();
                content.find('div[id$="_menu"]').remove();
                content.find('span[style*="display:none"]').remove();
                content.find('td.t_f').each((index, element) => {
                    const td = $(element);
                    if (
                        td
                            .html()!
                            .replaceAll(/<br\s*\/?>/gi, '')
                            .trim() === ''
                    ) {
                        td.remove();
                    }
                });
                content.find('img').each((index, element) => {
                    const img = $(element);
                    const zoomfile = img.attr('zoomfile');
                    const fullUrl = new URL(zoomfile, baseUrl).href;
                    img.attr('src', fullUrl);
                });

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: parseDate(item.pubDate!),
                    author: item.author,
                    description: content.html(),
                };
            })
        )
    );

    return {
        title: `老王论坛 - 最新主题 (自定义)`,
        link: 'https://laowang.vip/',
        description: '老王论坛最新主题的自定义 RSS 源，包含完整内容。',
        item: items,
    };
}
