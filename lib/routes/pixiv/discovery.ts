import { Route } from '@/types';
import { getToken } from './token';
import cache from '@/utils/cache';
import pixivUtils from './utils';
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

    const cmTags = ['催眠', '洗脳', '洗脑', '常識改変', 'マインドコントロール', 'hypnosis', 'mindcontrol'];
    const fsTags = ['TSF', '憑依', '乗っ取り', '入れ替わり', '精神汚染', '附身', '夺取', 'Possession', 'bodyswap'];

    const items = await Promise.all(
        illusts.map((illust: { id: string }) =>
            cache.tryGet(
                illust.id,
                async () => {
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
                    const showType = () => {
                        if (cmTags.some((tag) => illustData.tags.some((t) => t.name === tag))) {
                            return '[催眠]';
                        } else if (fsTags.some((tag) => illustData.tags.some((t) => t.name === tag))) {
                            return '[附身]';
                        }
                        return '[其他]';
                    };
                    return {
                        title: `${illustData.page_count}P | ${showType()} ${illustData.title}`,
                        author: illustData.user.name,
                        pubDate: new Date(),
                        description: `
                            <p>${showTags.join(', ')}</p>
                            <hr style="border: none; height: 1px; background-color: #000000;">
                            <p>${illustData.caption}</p>
                            <div>${images.join('<br>')}</div>
                        `,
                        link: `https://www.pixiv.net/artworks/${illust.id}`,
                        category: illustData.tags.map((tag: { name: string }) => tag.name),
                    };
                },
                24 * 60 * 60
            )
        )
    );

    return {
        title: 'Pixiv发现',
        link: 'https://www.pixiv.net/discovery?mode=r18',
        description: 'Pixiv发现可能喜欢的作品',
        item: items,
    };
}
