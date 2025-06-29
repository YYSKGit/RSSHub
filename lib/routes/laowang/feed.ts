import type { Route } from '@/types';
import got from '@/utils/got';
import * as cheerio from 'cheerio';
import parser from '@/utils/rss-parser';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';

export const route: Route = {
    path: '/feed/test',
    // @ts-ignore
    handler,
};

async function handler() {
    const feedUrl = 'https://laowang.vip/forum.php?mod=guide&view=newthread&rss=1';
    const feed = await parser.parseURL(feedUrl);

    const baseUrl = 'https://laowang.vip';
    const userCookie = process.env.LAOWANG_COOKIE;
    const items = await Promise.all(
        feed.items.map((item) =>
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
                    const tdHtml = td.html();
                    if (tdHtml && tdHtml.replaceAll(/<br\s*\/?>/gi, '').trim() === '') {
                        td.remove();
                    }
                });
                content.find('img').each((index, element) => {
                    const img = $(element);
                    const zoomfile = img.attr('zoomfile');
                    if (zoomfile) {
                        const fullUrl = new URL(zoomfile, baseUrl).href;
                        img.attr('src', fullUrl);
                    }
                });

                const showTags: string[] = [];
                const typeElement = $('div.deanjstopr > h3 > a');
                if (typeElement.length > 0) {
                    const typeName = typeElement.text();
                    const href = typeElement.attr('href');
                    if (href) {
                        const typeUrl = new URL(href, baseUrl).href;
                        showTags.push(`<strong><a href="${typeUrl}">#${typeName}</a></strong>`);
                    }
                }
                const tagElements = $('td.plc.ptm.pbm.vwthd > h1 > a');
                if (tagElements.length > 0) {
                    const tagName = tagElements.text().replaceAll(/^\[|\]$/g, '');
                    const href = tagElements.attr('href');
                    if (href) {
                        const tagUrl = new URL(href, baseUrl).href;
                        showTags.push(`<a href="${tagUrl}">#${tagName}</a>`);
                    }
                }

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: parseDate(item.pubDate!),
                    author: item.creator,
                    description: `
                        <p>${showTags.join(', ')}</p>
                        <hr style="border: none; height: 1px; background-color: #000000;">
                        <div>${content.html()}</div>
                    `,
                    category: item.categories,
                };
            })
        )
    );

    return {
        title: `老王论坛-最新发表`,
        link: 'https://laowang.vip/',
        description: '老王论坛最新发表帖子的个人RSS源，包含帖子的完整内容',
        item: items,
    };
}
