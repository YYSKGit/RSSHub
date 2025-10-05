import { Route } from '@/types';
import { getToken } from './token';
import cache from '@/utils/cache';
import { buildHeaderImageUrl } from '@/utils/yysk/tools';
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
        illusts.map(async (illust: { id: string }) => {
            const detail = await getIllustDetail(illust.id, token);
            const illustData = detail.data.illust;

            const buildOptions = {
                imageSize: 300,
                imageDuration: 0.6,
                transitionDuration: 0.2,
                imageFPS: 12,
                targetColumn: 2,
                waterfallTargetCount: 50,
            };
            const headerImages = buildHeaderImageUrl('pixiv', illust.id, pixivUtils.getImgUrls(illustData), buildOptions);
            const headerImagesHtmls = headerImages.map((url) => `<p><img src="${url}" style="max-width: 100%; height: auto;"/></p>`);

            // 已使用瀑布流展示图片，原始图片暂不显示
            // const images = pixivUtils.getImgs(illustData);
            // const showImages = images.length > 50 ? images.slice(50) : [];
            // <div>${showImages.join('<br>')}</div>

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
                    ${headerImagesHtmls.join('')}
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
