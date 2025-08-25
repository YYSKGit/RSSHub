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
    path: '/videos/:limit?',
    handler,
};

async function handler(ctx: { req: { param: (arg0: string) => string } }) {
    const limit = ctx.req.param('limit') ? Number.parseInt(ctx.req.param('limit')) : 50;

    const baseUrl = 'https://www.iwara.tv';
    const imgUrl = 'https://i.iwara.tv';
    const apiUrl = `https://api.iwara.tv`;

    const response = await got({
        method: 'get',
        url: `${apiUrl}/videos?rating=ecchi&sort=date&limit=${limit}&page=0`,
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
        title: 'Iwara-最新视频',
        link: `${baseUrl}/videos?sort=date`,
        description: 'Iwara上发布的最新视频',
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
        const embedID = item.embedUrl.split('/').pop();
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
