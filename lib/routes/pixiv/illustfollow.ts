import { Route } from '@/types';
import cache from '@/utils/cache';
import { buildPreviewImageUrl, buildWaterfallImageUrl } from '@/utils/yysk/tools';
import { getToken } from './token';
import getIllustFollows from './api/get-illust-follows';
import { config } from '@/config';
import pixivUtils from './utils';
import { parseDate } from '@/utils/parse-date';
import ConfigNotFoundError from '@/errors/types/config-not-found';

export const route: Route = {
    path: '/user/illustfollows',
    categories: ['social-media'],
    example: '/pixiv/user/illustfollows',
    parameters: {},
    features: {
        requireConfig: [
            {
                name: 'PIXIV_REFRESHTOKEN',
                description: '',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['www.pixiv.net/bookmark_new_illust.php'],
        },
    ],
    name: 'Following timeline',
    maintainers: ['ClarkeCheng'],
    handler,
    url: 'www.pixiv.net/bookmark_new_illust.php',
    description: `::: warning
  Only for self-hosted
:::`,
};

async function handler() {
    if (!config.pixiv || !config.pixiv.refreshToken) {
        throw new ConfigNotFoundError('pixiv RSS is disabled due to the lack of <a href="https://docs.rsshub.app/deploy/config#route-specific-configurations">relevant config</a>');
    }

    const token = await getToken(cache.tryGet);
    if (!token) {
        throw new ConfigNotFoundError('pixiv not login');
    }

    const response = await getIllustFollows(token);
    const illusts = response.data.illusts;
    return {
        title: `Pixiv关注的新作品`,
        link: 'https://www.pixiv.net/bookmark_new_illust.php',
        description: `Pixiv关注的画师们的最新作品`,
        item: await Promise.all(
            illusts.map(async (illust) => {
                const previewImage = await buildPreviewImageUrl('pixiv', illust.id, pixivUtils.getImgUrls(illust), { imageSize: 300, imageDuration: 0.6, transitionDuration: 0.2, imageFPS: 12 });
                const previewImageHtml = `<img src="${previewImage}" style="max-width: 100%; height: auto;"/>`;
                const waterfallImage = await buildWaterfallImageUrl('pixiv', illust.id, pixivUtils.getImgUrls(illust), { targetColumn: 2, targetCount: 50 });
                const waterfallImageHtml = `<img src="${waterfallImage}" style="max-width: 100%; height: auto;"/>`;
                const images = pixivUtils.getImgs(illust);
                const showImages = images.length > 50 ? images.slice(50) : [];
                const tagLinks = illust.tags.map((tag) => {
                    const tagName = tag.name;
                    const encodedTagName = encodeURIComponent(tagName);
                    const tagUrl = `https://www.pixiv.net/tags/${encodedTagName}`;
                    return `<a href="${tagUrl}">#${tagName}</a>`;
                });
                const aiTypeText = '<strong><a href="https://www.pixiv.net/tags/AI/artworks?s_mode=s_tag">#AI生成</a></strong>';
                const userLink = `<strong><a href="https://www.pixiv.net/users/${illust.user.id}">@${illust.user.name}</a></strong>`;
                const showTags = [userLink, ...(illust.illust_ai_type === 2 ? [aiTypeText] : []), ...tagLinks];
                return {
                    title: `${illust.page_count}P | ${illust.title}`,
                    author: illust.user.name,
                    pubDate: parseDate(illust.create_date),
                    description: `
                    <p>${showTags.join(', ')}</p>
                    <hr style="border: none; height: 1px; background-color: #000000;">
                    <p>${illust.caption}</p>
                    <p>${previewImageHtml}</p>
                    <p>${waterfallImageHtml}</p>
                    <div>${showImages.join('<br>')}</div>
                `,
                    link: `https://www.pixiv.net/artworks/${illust.id}`,
                    category: illust.tags.map((tag) => tag.name),
                };
            })
        ),
    };
}
