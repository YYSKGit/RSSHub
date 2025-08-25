import type { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';

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
        data.results.map((item: { id: string }) =>
            cache.tryGet(item.id, async () => {
                const video = await got({
                    method: 'get',
                    url: `${apiUrl}/video/${item.id}`,
                });
                return getItemData(video.data, baseUrl, imgUrl);
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
    let showImgHtmls: string[] = [];
    if (item.file) {
        const webpHtml = `<img src="${imgUrl}/image/original/${item.file.id}/preview.webp" style="width: 100%; height: auto;">`;
        const jpgHtmls = Array.from({ length: item.file.numThumbnails }, (_, i) => {
            const jpgUrl = `${imgUrl}/image/original/${item.file.id}/thumbnail-${String(i).padStart(2, '0')}.jpg`;
            return `<img src="${jpgUrl}" style="max-width: 100%; height: auto;">`;
        });
        showImgHtmls = [webpHtml, ...jpgHtmls];
    } else if (item.embedUrl) {
        const embedID = item.embedUrl.split('/').pop();
        showImgHtmls = [`<img src="${imgUrl}/image/embed/original/youtube/${embedID}" style="max-width: 100%; height: auto;">`];
    }
    const showBodyHtml = item.body ? `<p>${item.body}</p>` : '';
    const description = `
        <p>${showTagHtmls.join(', ')}</p>
        <hr style="border: none; height: 1px; background-color: #000000;">
        ${showBodyHtml}
        <div>${showImgHtmls.join('<br>')}</div>
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
