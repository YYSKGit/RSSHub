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
    const userCookie = process.env.LIBFANS_COOKIE;

    // 配置图片代理
    const proxyConfig = {
        'gzroom.wordpress.com': 'gzroom.yyskweb.com',
    };
    const proxyKey = process.env.ACCESS_KEY;

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
            const $descriptionContainer = $item.find('.post-text.js_readmore');

            // 过滤掉没有内容的条目
            if (!$descriptionContainer.html()?.trim()) {
                return null;
            }

            // 替换图片链接为<img>标签，并应用域名代理
            $descriptionContainer.find('a').each((_, element) => {
                const $link = $(element);
                const href = $link.attr('href');
                if (href && /\.(jpg|jpeg|png|gif|webp)$/i.test(href)) {
                    let finalImageUrl = href;
                    try {
                        const imageUrl = new URL(href);
                        if (proxyConfig[imageUrl.hostname]) {
                            imageUrl.hostname = proxyConfig[imageUrl.hostname];
                            if (proxyKey) {
                                imageUrl.searchParams.set('key', proxyKey);
                            }
                            finalImageUrl = imageUrl.toString();
                        }
                    } catch {
                        // 忽略无效的URL，保持原始链接
                    }

                    const imgTag = `<p><img src="${finalImageUrl}" style="max-width: 100%; height: auto;"></p>`;
                    $link.replaceWith(imgTag);
                }
            });

            // 移除<img>段落周围所有连续的<br>标签
            $descriptionContainer.find('p:has(img)').each((_, pElement) => {
                const $p = $(pElement);
                $p.nextUntil(':not(br)').remove();
                $p.prevUntil(':not(br)').remove();
            });

            // 清理条目首尾<br>元素
            let finalHtml = $descriptionContainer.html() || '';
            if (finalHtml) {
                finalHtml = finalHtml
                    .trim()
                    .replace(/^(\s*<br\s*\/?>\s*)+/i, '')
                    .replace(/(\s*<br\s*\/?>\s*)+$/i, '');
            }

            // 确保条目以段落元素开头
            if (!finalHtml.startsWith('<p>')) {
                finalHtml = `<p></p>${finalHtml}`;
            }

            return {
                title: `${authorLink.text()} 发表了新帖子`,
                link: timeLink.attr('href'),
                pubDate: parseDate(timeLink.attr('data-time')! + 'Z'),
                author: authorLink.text(),
                description: `
                    <p><a href="${authorLink.attr('href')}">@${authorLink.text()}</a></p>
                    <hr style="border: none; height: 1px; background-color: #000000;">
                    ${finalHtml}
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
