import { Route } from '@/types';
import { getToken } from './token';
import cache from '@/utils/cache';
import pixivUtils from './utils';
import { parseDate } from '@/utils/parse-date';
import getUserIllustDiscovery from './api/get-illust-discovery';
import getIllustDetail from './api/get-illust-detail';
import ConfigNotFoundError from '@/errors/types/config-not-found';

// @ts-ignore
export const route: Route = {
    path: '/user/discovery/:limit?',
    handler,
};

async function handler(ctx) {
    const token = await getToken(cache.tryGet);
    if (!token) {
        throw new ConfigNotFoundError('pixiv not login');
    }
    const cookie = process.env.PIXIV_COOKIE;
    if (!cookie) {
        throw new ConfigNotFoundError('No cookie provided');
    }

    const limit = ctx.req.param('limit') || 10;
    const response = await getUserIllustDiscovery(cookie, limit);
    const illusts = response.data.body.thumbnails.illust;

    const items = await Promise.all(
        illusts.map(async (illust: { id: string }) => {
            const detail = await getIllustDetail(illust.id, token);
            const illustData = detail.data.illust;
            const images = pixivUtils.getImgs(illustData);
            const tagLinks = illustData.tags.map((tag: { name: string }) => {
                const tagName = tag.name;
                const encodedTagName = encodeURIComponent(tagName);
                const tagUrl = `https://www.pixiv.net/tags/${encodedTagName}`;
                return `<a href="${tagUrl}">#${tagName}</a>`;
            });
            const aiTypeText = '<strong><a href="https://www.pixiv.net/tags/AI/artworks?s_mode=s_tag">#AI生成</a></strong>';
            const userLink = `<strong><a href="https://www.pixiv.net/users/${illustData.user.id}">@${illustData.user.name}</a></strong>`;
            const showTags = [userLink, ...(illustData.illust_ai_type === 2 ? [aiTypeText] : []), ...tagLinks];
            return {
                title: `${illustData.page_count}P | ${illustData.title}`,
                author: illustData.user.name,
                pubDate: parseDate(illustData.create_date),
                description: `
                    <p>${showTags.join(', ')}</p>
                    <hr style="border: none; height: 1px; background-color: #000000;">
                    <p>${illustData.caption}</p>
                    <div>${images.join('<br>')}</div>
                `,
                link: `https://www.pixiv.net/artworks/${illust.id}`,
                category: illustData.tags.map((tag: { name: string }) => tag.name),
            };
        })
    );

    return {
        title: 'Pixiv发现',
        link: 'https://www.pixiv.net/discovery?mode=r18',
        description: 'Pixiv发现可能喜欢的作品',
        item: items,
    };
}
