import type { Route } from '@/types';
import got from '@/utils/got';
import * as cheerio from 'cheerio';
import parser from '@/utils/rss-parser';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';

export const route: Route = {
    path: '/newthread',
    // @ts-ignore
    handler,
};

async function handler() {
    const feedUrl = 'https://laowang.vip/forum.php?mod=guide&view=newthread&rss=1';
    const feed = await parser.parseURL(feedUrl);

    const baseUrl = 'https://laowang.vip';
    const authorSpaceUrl = '&do=thread&view=me&from=space';
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

                // 清理图片容器并补全链接
                content.find('ignore_js_op').each((_index, element) => {
                    const wrapper = $(element);
                    const img = wrapper.find('img.zoom');
                    if (img.length === 0) {
                        wrapper.remove();
                        return;
                    }
                    const relativePath = img.attr('zoomfile') || img.attr('file') || img.attr('src');
                    if (relativePath) {
                        const fullUrl = new URL(relativePath, baseUrl).href;
                        const newImageHtml = `<p><img src="${fullUrl}" style="max-width: 100%; height: auto;"></p>`;
                        wrapper.replaceWith(newImageHtml);
                    } else {
                        wrapper.remove();
                    }
                });
                // 删除散落在文章中的干扰元素
                content.find('font.jammer').remove();
                content.find('span[style*="display:none"]').remove();
                content.find('i.pstatus').remove();

                // 提取表格内元素
                content.find('td.t_f').each((_index, element) => {
                    const td = $(element);
                    const htmlContent = td.html() || '';
                    if (htmlContent.replaceAll(/<br\s*\/?>/gi, '').trim() === '') {
                        const tableToRemove = td.closest('table');
                        if (tableToRemove.length > 0) {
                            tableToRemove.remove();
                        } else {
                            td.remove();
                        }
                    } else {
                        const tableToUnwrap = td.closest('table');
                        if (tableToUnwrap.length > 0) {
                            tableToUnwrap.replaceWith(htmlContent);
                        } else {
                            td.replaceWith(htmlContent);
                        }
                    }
                });

                // 构建文章开头标签
                const showTags: string[] = [];
                const authorElement = $('div.pi > div.authi  > a').first();
                if (authorElement.length > 0) {
                    const authorName = authorElement.text();
                    const href = authorElement.attr('href');
                    if (authorName && href) {
                        const authorUrl = new URL(href, baseUrl).href;
                        showTags.push(`<a href="${authorUrl}${authorSpaceUrl}">@${authorName}</a>`);
                    }
                }
                const typeElement = $('div.deanjstopr > h3 > a');
                if (typeElement.length > 0) {
                    const typeName = typeElement.text();
                    const href = typeElement.attr('href');
                    if (typeName && href) {
                        const typeUrl = new URL(href, baseUrl).href;
                        showTags.push(`<strong><a href="${typeUrl}">#${typeName}</a></strong>`);
                    }
                }
                const tagElements = $('td.plc.ptm.pbm.vwthd > h1 > a');
                if (tagElements.length > 0) {
                    const tagName = tagElements.text().replaceAll(/^\[|\]$/g, '');
                    const href = tagElements.attr('href');
                    if (tagName && href) {
                        const tagUrl = new URL(href, baseUrl).href;
                        showTags.push(`<a href="${tagUrl}">#${tagName}</a>`);
                    }
                }
                const tagContainer = content.find('div.ptg.mbm.mtn');
                if (tagContainer.length > 0) {
                    tagContainer.find('a').each((_index, element) => {
                        const tagName = $(element).text();
                        const href = $(element).attr('href');
                        if (tagName && href) {
                            const tagUrl = new URL(href, baseUrl).href;
                            showTags.push(`<a href="${tagUrl}">#${tagName}</a>`);
                        }
                    });
                    tagContainer.remove();
                }

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
                    pubDate: parseDate(item.pubDate!),
                    author: item.creator,
                    description: `
                        <p>${showTags.join(', ')}</p>
                        <hr style="border: none; height: 1px; background-color: #000000;">
                        <div>${finalHtml}</div>
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
