import { Route } from '@/types';
import cache from '@/utils/cache';
import EhAPI from './ehapi';

export const route: Route = {
    path: '/watched/:params?/:page?/:routeParams?',
    categories: ['picture'],
    example: '/ehentai/watched/f_cats=1021/0/bittorrent=true&embed_thumb=false',
    parameters: { params: 'Search parameters. You can copy the content after `https://e-hentai.org/watched/?`', page: 'Page number, set 0 to get latest', routeParams: 'Additional parameters, see the table above' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: true,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Watched',
    maintainers: ['yindaheng98', 'syrinka'],
    handler,
};

async function handler(ctx) {
    const page = ctx.req.param('page');
    let params = ctx.req.param('params');
    const routeParams = new URLSearchParams(ctx.req.param('routeParams'));
    const bittorrent = routeParams.get('bittorrent') || false;
    const embed_thumb = routeParams.get('embed_thumb') || false;
    let items;
    if (page) {
        // 如果定义了page，就要覆盖params
        params = params.replace(/&*next=[^&]$/, '').replace(/next=[^&]&/, '');
        items = await EhAPI.getWatchedItems(cache, params, page, bittorrent, embed_thumb);
    } else {
        items = await EhAPI.getWatchedItems(cache, params, undefined, bittorrent, embed_thumb);
    }
    let title = params;
    const match = /f_search=([^&]+)/.exec(title);
    if (match !== null) {
        title = match[1];
    }

    return EhAPI.from_ex
        ? {
              title: title + ' - ExHentai Watched ',
              link: `https://exhentai.org/watched?${params}`,
              item: items,
          }
        : {
              title: title + ' - E-Hentai Watched ',
              link: `https://e-hentai.org/watched?${params}`,
              item: items,
          };
}
