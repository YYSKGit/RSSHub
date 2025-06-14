import type { Route } from '@/types';
import got from '@/utils/got';
import parser from '@/utils/rss-parser';

export const route: Route = {
    path: '/feed',
    handler,
};

async function handler(ctx) {

    const feedUrl = 'https://cangku.moe/feed';
    const cookie = process.env.CANGKU_COOKIE;
    const response = await got.get(feedUrl, {
        headers: {
            Cookie: cookie,
        },
    });

    const fixedText = response.body.trim();
    const feed = await parser.parseString(fixedText);
    const items = feed.items.map((item) => ({
        title: item.title,
        pubDate: item.pubDate,
        link: item.link,
        description: item.content, 
        author: item.author, 
    }));
    
    return {
        title: '绅士仓库',
        link: feed.link,
        description: '绅士仓库官方RSS修复[Cookie登录]',
        item: items,
    };
}