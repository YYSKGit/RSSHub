import type { Route } from '@/types';
import got from '@/utils/got';
import * as cheerio from 'cheerio';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/discover',
    // @ts-ignore
    handler,
};

async function handler() {
    const baseUrl = 'https://libfans.com';
    const apiUrl = new URL('/includes/ajax/data/load.php', baseUrl).href;
    const defaultImgs = new Set(['https://libfans.com/content/themes/default/images/og-image.jpg', 'https://drive.proton.me/assets/proton-og-image.png']);
    const userCookie = process.env.LIBFANS_COOKIE;

    // 并行请求多个页面
    const pageRequests = Array.from({ length: 5 }, (_, i) =>
        got({
            method: 'post',
            url: apiUrl,
            form: {
                get: 'discover',
                filter: 'all',
                country: 'all',
                offset: i,
            },
            headers: {
                'x-requested-with': 'XMLHttpRequest',
                Cookie: userCookie,
            },
        })
    );

    // 将所有页面的HTML响应合并成一个
    const responses = await Promise.all(pageRequests);
    const fullHtml = responses.map((res) => res.data.data).join('');
    const $ = cheerio.load(fullHtml);

    const items = $('.post-body')
        .toArray()
        .map((item) => {
            const $item = $(item);
            const authorLink = $item.find('a.post-author');
            const timeLink = $item.find('a.js_moment');
            const descriptionContainer = $item.find('.post-text.js_readmore');

            // 过滤掉没有内容的条目
            if (!descriptionContainer.html()?.trim()) {
                return null;
            }

            // 提取图片链接
            let imageElement = '';
            const imageDiv = $item.find('div.mt10.plr15 div.image');
            if (imageDiv.length) {
                const style = imageDiv.attr('style');
                const match = style!.match(/url\(['"]?(.+?)['"]?\)/);
                if (match && match[1] && !defaultImgs.has(match[1])) {
                    imageElement = `<p><img src="${match[1]}" style="max-width: 100%; height: auto;"></p>`;
                }
            }

            return {
                title: `${authorLink.text()} 发表了新帖子`,
                link: timeLink.attr('href'),
                pubDate: parseDate(timeLink.attr('data-time')! + 'Z'),
                author: authorLink.text(),
                description: `
                <p><a href="${authorLink.attr('href')}">@${authorLink.text()}</a></p>
                <hr style="border: none; height: 1px; background-color: #000000;">
                ${imageElement}
                <div>${descriptionContainer.html()}</div>
                `,
            };
        })
        .filter(Boolean);

    return {
        title: '最新投稿-LiBFans',
        link: `${baseUrl}/discover`,
        description: 'LiBFans上发表的最新帖子',
        item: items,
    };
}
