import type { Route } from '@/types';
import got from '@/utils/got';
import iconv from 'iconv-lite';
import * as cheerio from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';

export const route: Route = {
    path: '/newthread/:fid',
    // @ts-ignore
    handler,
};

async function handler(ctx) {
    const baseUrl = 'https://ikstar.com';
    const proxyUrl = 'https://ikstar.yyskweb.com';
    const proxyKey = process.env.ACCESS_KEY ?? '';
    const userCookie = process.env.IKSTAR_COOKIE;

    // 分页抓取目标板块的文章列表
    const fid = ctx.req.param('fid');
    const listUrl = `${baseUrl}/forum.php?mod=forumdisplay&fid=${fid}&filter=lastpost&orderby=lastpost`;
    const pageUrls = Array.from({ length: 1 }, (_, i) => `${listUrl}&page=${i + 1}`);
    const pageResponses = await Promise.all(
        pageUrls.map((url) =>
            got({
                method: 'get',
                url,
                headers: {
                    Cookie: userCookie,
                },
                responseType: 'buffer',
            })
        )
    );

    // 解析每一页的文章列表
    let pageTitle = '';
    let list: { title: string; link: string; cover: string }[] = [];
    for (const response of pageResponses) {
        const $ = cheerio.load(iconv.decode(response.body, 'gbk'));
        if (!pageTitle) {
            pageTitle = $('title').text();
        }
        const threadList = $('#waterfall > li');
        const pageItems = threadList.toArray().map((element) => {
            const titleElement = $(element).find('div.c a[title]');
            const coverElement = titleElement.find('img');
            return {
                title: titleElement.attr('title')!,
                link: new URL(titleElement.attr('href')!, baseUrl).href.split('&extra=')[0],
                cover: new URL(`${coverElement.attr('src')}?key=${proxyKey}`, proxyUrl).href,
            };
        });
        list = [...list, ...pageItems];
    }
    list = list.filter((item, index, self) => index === self.findIndex((t) => t.link === item.link));

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link!, async () => {
                const response = await got({
                    method: 'get',
                    url: item.link,
                    headers: {
                        Cookie: userCookie,
                    },
                    responseType: 'buffer',
                });

                const $ = cheerio.load(iconv.decode(response.body, 'gbk'));
                const content = $('[id^="postmessage_"]').first();

                // 清理图片容器并补全链接
                content.find('ignore_js_op').each((_index, element) => {
                    const wrapper = $(element);
                    const img = wrapper.find('img.zoom');
                    if (img.length === 0) {
                        wrapper.remove();
                        return;
                    }
                    const relativePath = img.attr('data-echo') || img.attr('zoomfile') || img.attr('file') || img.attr('src');
                    if (relativePath) {
                        const fullUrl = new URL(`${relativePath}?key=${proxyKey}`, proxyUrl).href;
                        const newImageHtml = `<img src="${fullUrl}" style="max-width: 100%; height: auto;">`;
                        wrapper.replaceWith(newImageHtml);
                    } else {
                        wrapper.remove();
                    }
                });

                // 构建文章开头标签
                const showTags: string[] = [];
                let authorName = '';
                const authorElement = $('div.pi div.authi > a').first();
                if (authorElement.length > 0) {
                    authorName = authorElement.text();
                    const href = authorElement.attr('href');
                    if (authorName && href) {
                        const match = href.match(/space-uid-(\d+)\.html/);
                        if (match && match[1]) {
                            const authorID = match[1];
                            const authorUrl = new URL(`home.php?mod=space&uid=${authorID}&do=thread&view=me&from=space`, baseUrl).href;
                            showTags.push(`<a href="${authorUrl}">@${authorName}</a>`);
                        }
                    }
                }
                let typeName = '';
                const typeElement = $('h1.ts > a');
                if (typeElement.length > 0) {
                    typeName = typeElement.text().match(/\[(.*?)\]/)?.[1] ?? '';
                    const href = typeElement.attr('href');
                    if (typeName && href) {
                        const typeUrl = new URL(href, baseUrl).href;
                        showTags.push(`<strong><a href="${typeUrl}">#${typeName}</a></strong>`);
                    }
                }
                const pubDate = $('[id^="authorposton"]').first().text();

                // 清理文章首尾<br>元素
                let finalHtml = content.html();
                if (finalHtml) {
                    finalHtml = finalHtml
                        .trim()
                        .replace(/^(\s*<br\s*\/?>\s*)+/i, '')
                        .replace(/(\s*<br\s*\/?>\s*)+$/i, '');
                }

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: parseDate(pubDate!),
                    author: authorName,
                    description: `
                            <p>${showTags.join(', ')}</p>
                            <hr style="border: none; height: 1px; background-color: #000000;">
                            <p><img src="${item.cover}" style="max-width: 100%; height: auto;"></p>
                            <p>${finalHtml}</p>
                        `,
                    category: typeName,
                };
            })
        )
    );

    return {
        title: pageTitle,
        link: `${baseUrl}/forum.php?mod=forumdisplay&fid=${fid}`,
        description: `${pageTitle}_包含完整帖子内容`,
        item: items,
    };
}
