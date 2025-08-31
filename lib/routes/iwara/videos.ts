import type { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
});

// @ts-ignore
export const route: Route = {
    path: '/videos/:category/:limit?',
    handler,
};

async function handler(ctx: { req: { param: (arg0: string) => string } }) {
    const category = ctx.req.param('category');
    const limit = ctx.req.param('limit') ? Number.parseInt(ctx.req.param('limit')) : 50;

    const baseUrl = 'https://www.iwara.tv';
    const imgUrl = 'https://i.iwara.tv';
    const apiUrl = `https://api.iwara.tv`;

    let sort = 'date';
    let text = '最新';
    if (category === 'trending') {
        sort = 'trending';
        text = '热门';
    }

    const response = await got({
        method: 'get',
        url: `${apiUrl}/videos?rating=ecchi&sort=${sort}&limit=${limit}&page=0`,
    });

    const data = response.data;
    const items = await Promise.all(
        data.results.map((item: any) =>
            cache.tryGet(item.id, async () => {
                try {
                    const video = await got({
                        method: 'get',
                        url: `${apiUrl}/video/${item.id}`,
                    });
                    return getItemData(video.data, baseUrl, imgUrl);
                } catch {
                    return getItemData(item, baseUrl, imgUrl);
                }
            })
        )
    );

    return {
        title: `Iwara-${text}视频`,
        link: `${baseUrl}/videos?sort=${sort}`,
        description: `Iwara上发布的${text}视频`,
        item: items,
    };
}

function getItemData(item: any, baseUrl: string, imgUrl: string) {
    const authorHtml = `<strong><a href="${baseUrl}/profile/${item.user.username}">@${item.user.name}</a></strong>`;
    const tagHtmls = item.tags.map((tag: { id: string }) => `<a href="${baseUrl}/videos?tags=${tag.id}">#${tag.id}</a>`);
    const showTagHtmls = [authorHtml, ...tagHtmls];
    let imgUrls: string[] = [];
    if (item.file) {
        const thumUrl = `${imgUrl}/image/thumbnail/${item.file.id}/thumbnail-${String(item.thumbnail).padStart(2, '0')}.jpg`;
        const webpUrl = `${imgUrl}/image/original/${item.file.id}/preview.webp`;
        const jpgUrls = Array.from({ length: item.file.numThumbnails }, (_, i) => {
            const jpgUrl = `${imgUrl}/image/original/${item.file.id}/thumbnail-${String(i).padStart(2, '0')}.jpg`;
            return jpgUrl;
        });
        imgUrls = [thumUrl, webpUrl, ...jpgUrls];
    } else if (item.embedUrl) {
        const embedID = new URL(item.embedUrl).searchParams.get('v');
        imgUrls = [`${imgUrl}/image/embed/original/youtube/${embedID}`];
    }
    const showImgHtmls = imgUrls.map((url) => `<p><img src="${url}" style="max-width: 100%; height: auto;"></p>`);
    const showBodyHtml = item.body ? md.render(item.body) : '';
    const description = `
        <p>${showTagHtmls.join(', ')}</p>
        <hr style="border: none; height: 1px; background-color: #000000;">
        ${showBodyHtml}
        <div>${showImgHtmls.join('')}</div>
    `;
    return {
        title: item.title,
        author: item.user.name,
        pubDate: parseDate(item.createdAt),
        description,
        link: `${baseUrl}/video/${item.id}`,
        category: item.tags.map((tag: { id: string }) => tag.id),
    };
}
