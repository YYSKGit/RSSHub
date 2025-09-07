import { Route, ViewType } from '@/types';
import cache from '@/utils/cache';
import { buildHeaderImageUrl } from '@/utils/yysk/tools';
import { getToken } from './token';
import searchPopularIllust from './api/search-popular-illust';
import searchIllust from './api/search-illust';
import { config } from '@/config';
import pixivUtils from './utils';
import { parseDate } from '@/utils/parse-date';
import ConfigNotFoundError from '@/errors/types/config-not-found';

export const route: Route = {
    path: '/search/:keyword/:order?/:mode?/:include_ai?',
    categories: ['social-media'],
    view: ViewType.Pictures,
    example: '/pixiv/search/Nezuko/popular',
    parameters: {
        keyword: 'keyword',
        order: {
            description: 'rank mode, empty or other for time order, popular for popular order',
            default: 'date',
            options: [
                {
                    label: 'time order',
                    value: 'date',
                },
                {
                    label: 'popular order',
                    value: 'popular',
                },
            ],
        },
        mode: {
            description: 'filte R18 content',
            default: 'no',
            options: [
                {
                    label: 'only not R18',
                    value: 'safe',
                },
                {
                    label: 'only R18',
                    value: 'r18',
                },
                {
                    label: 'no filter',
                    value: 'no',
                },
            ],
        },
        include_ai: {
            description: 'whether AI-generated content is included',
            default: 'yes',
            options: [
                {
                    label: 'does not include AI-generated content',
                    value: 'no',
                },
                {
                    label: 'include AI-generated content',
                    value: 'yes',
                },
            ],
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Keyword',
    maintainers: ['DIYgod'],
    handler,
};

async function handler(ctx) {
    if (!config.pixiv || !config.pixiv.refreshToken) {
        throw new ConfigNotFoundError('pixiv RSS is disabled due to the lack of <a href="https://docs.rsshub.app/deploy/config#route-specific-configurations">relevant config</a>');
    }

    const keyword = ctx.req.param('keyword');
    const order = ctx.req.param('order') || 'date';
    const mode = ctx.req.param('mode');
    const includeAI = ctx.req.param('include_ai');

    const token = await getToken(cache.tryGet);
    if (!token) {
        throw new ConfigNotFoundError('pixiv not login');
    }

    const response = await (order === 'popular' ? searchPopularIllust(keyword, token) : searchIllust(keyword, token));

    let illusts = response.data.illusts;
    if (mode === 'safe' || mode === '1') {
        illusts = illusts.filter((item) => item.x_restrict === 0);
    } else if (mode === 'r18' || mode === '2') {
        illusts = illusts.filter((item) => item.x_restrict === 1);
    }

    if (includeAI === 'no' || includeAI === '0') {
        illusts = illusts.filter((item) => item.illust_ai_type <= 1);
    }

    return {
        title: `${keyword} 的 pixiv ${order === 'popular' ? '热门' : ''}内容`,
        link: `https://www.pixiv.net/tags/${keyword}/artworks`,
        item: await Promise.all(
            illusts.map((illust) => {
                const buildOptions = {
                    imageSize: 300,
                    imageDuration: 0.6,
                    transitionDuration: 0.2,
                    imageFPS: 12,
                    targetColumn: 2,
                    waterfallTargetCount: 50,
                };
                const headerImages = buildHeaderImageUrl('pixiv', illust.id, pixivUtils.getImgUrls(illust), buildOptions);
                const headerImagesHtmls = headerImages.map((url) => `<img src="${url}" style="max-width: 100%; height: auto;"/>`);

                // 已使用瀑布流展示图片，原始图片暂不显示
                // const images = pixivUtils.getImgs(illust);
                // const showImages = images.length > 50 ? images.slice(50) : [];
                // <div>${showImages.join('<br>')}</div>

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
                    ${headerImagesHtmls.join('')}
                `,
                    link: `https://www.pixiv.net/artworks/${illust.id}`,
                    category: illust.tags.map((tag) => tag.name),
                };
            })
        ),
        allowEmpty: true,
    };
}
