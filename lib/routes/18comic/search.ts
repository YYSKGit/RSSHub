import { Route } from '@/types';
import { apiMapCategory, apiMapIDCategory, defaultDomain, getApiUrl, getRootUrl, processApiItems } from './utils';
import { getSliceCount } from './slice';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';

export const route: Route = {
    path: '/search/:option?/:category?/:keyword?/:time?/:order?',
    categories: ['anime'],
    example: '/18comic/search/photos/all/NTR',
    parameters: {
        option: '选项，可选 `video` 和 `photos`，默认为 `photos`',
        category: '分类，同上表，默认为 `all` 即全部',
        keyword: '关键字，同上表，默认为空',
        time: '时间范围，同上表，默认为 `a` 即全部',
        order: '排列顺序，同上表，默认为 `mr` 即最新',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
        nsfw: true,
    },
    radar: [
        {
            source: ['jmcomic.group/'],
            target: '/:category?/:time?/:order?/:keyword?',
        },
    ],
    name: '搜索',
    maintainers: [],
    handler,
    url: 'jmcomic.group/',
    description: `::: tip
  关键字必须超过两个字，这是来自网站的限制。
:::`,
};

async function handler(ctx) {
    const option = ctx.req.param('option') ?? 'photos';
    const category = ctx.req.param('category') ?? 'all';
    const keyword = ctx.req.param('keyword') ?? '';
    const keywordEncoded = encodeURIComponent(keyword);
    const time = ctx.req.param('time') ?? 'a';
    const { domain = defaultDomain } = ctx.req.query();
    const rootUrl = getRootUrl(domain);
    let order = ctx.req.param('order') ?? 'mr';
    const currentUrl = `${rootUrl}/search/${option}${category === 'all' ? '' : `/${category}`}${keywordEncoded ? `?search_query=${keywordEncoded}` : '?'}${time === 'a' ? '' : `&t=${time}`}${order === 'mr' ? '' : `&o=${order}`}`;
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 20;

    const API_BASE = 'https://api.yyskweb.com/unscramble';
    const accessKey = process.env.ACCESS_KEY ?? '';

    let apiUrl = getApiUrl();
    order = time === 'a' ? order : `${order}_${time}`;
    apiUrl = `${apiUrl}/search?search_query=${keywordEncoded}&o=${order}`;
    let apiResult = await processApiItems(apiUrl);
    let filteredItemsByCategory = apiResult.content;
    // Filter items by category if not 'all'
    if (category !== 'all') {
        filteredItemsByCategory = apiResult.content.filter((item) => item.category.title === apiMapCategory(category));
    }
    filteredItemsByCategory = filteredItemsByCategory.slice(0, limit);
    const results = await Promise.all(
        filteredItemsByCategory.map((item) =>
            cache.tryGet(`18comic:search:${item.id}`, async () => {
                const result = {};
                result.title = item.name;
                result.link = `${rootUrl}/album/${item.id}`;
                result.updated = parseDate(item.update_at);
                apiUrl = `${getApiUrl()}/album?id=${item.id}`;
                apiResult = await processApiItems(apiUrl);
                result.pubDate = new Date(apiResult.addtime * 1000);
                result.category = apiResult.tags.filter((tag) => tag.trim() !== '');
                result.author = apiResult.author.filter((a) => a.trim() !== '').join(', ');

                const authorHtmls = apiResult.author
                    .filter((a) => a.trim() !== '')
                    .map((a) => {
                        const authorUrl = `${rootUrl}/search/${option}?search_query=${encodeURIComponent(a)}`;
                        return `<strong><a href="${authorUrl}">@${a}</a></strong>`;
                    });
                const typeHtml = () => {
                    const type = item.category.title;
                    const typeID = item.category.id;
                    const typeMap = apiMapIDCategory(typeID);
                    if (typeMap) {
                        const typeUrl = `${rootUrl}/albums/${typeMap}`;
                        return `<strong><a href="${typeUrl}">#${type}</a></strong>`;
                    } else {
                        return `<strong>#${type}</strong>`;
                    }
                };
                const categoryHtmls = result.category.map((tag) => {
                    const tagUrl = `${rootUrl}/search/${option}?search_query=${encodeURIComponent(tag)}`;
                    return `<a href="${tagUrl}">#${tag}</a>`;
                });
                const actorHtmls = apiResult.actors
                    .filter((actor) => actor.trim() !== '')
                    .map((actor) => {
                        const actorUrl = `${rootUrl}/search/${option}?search_query=${encodeURIComponent(actor)}`;
                        return `<a href="${actorUrl}">#${actor}</a>`;
                    });
                const workHtmls = apiResult.works
                    .filter((work) => work.trim() !== '')
                    .map((work) => {
                        const workUrl = `${rootUrl}/search/${option}?search_query=${encodeURIComponent(work)}`;
                        return `<a href="${workUrl}">#${work}</a>`;
                    });
                const tagHtmls = [...authorHtmls, typeHtml(), ...actorHtmls, ...workHtmls, ...categoryHtmls];
                const imageHtmls = Array.from({ length: 50 }, (_, i) => {
                    const number = (i + 1).toString().padStart(5, '0');
                    const sliceCount = getSliceCount(item.id, number);
                    const url = encodeURIComponent(`https://cdn-msp3.${domain}/media/photos/${item.id}/${number}.webp`);
                    const slicedUrl = `${API_BASE}?name=18comic&id=${item.id}&url=${url}&strips=${sliceCount}&key=${accessKey}`;
                    return slicedUrl;
                }).map((url) => `<img src="${url}" style="max-width: 100%; height: auto;" />`);
                result.description = `
                    <p>${tagHtmls.join(', ')}</p>
                    <hr style="border: none; height: 1px; background-color: #000000;">
                    <p>${apiResult.description}</p>
                    <div>${imageHtmls.join('')}</div>
                `;

                return result;
            })
        )
    );

    return {
        title: `Search Results For '${keyword}' - 禁漫天堂`,
        link: currentUrl.replace(/\?$/, ''),
        item: results,
    };
}
