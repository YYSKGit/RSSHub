import type { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

// @ts-ignore
export const route: Route = {
    path: '/:domainName/:limit?',
    handler,
};

async function handler(ctx) {
    const domainName = ctx.req.param('domainName');
    const limit = ctx.req.param('limit') ? Number.parseInt(ctx.req.param('limit')) : 100;
    const timestamp = Date.now();

    const apiUrl = `https://api.unifans.io/creator/posts?domainName=${domainName}&skip=0&limit=${limit}&order=1&_t=${timestamp}&languageCode=zh`;
    const baseUrl = 'https://app.unifans.io';

    const response = await got({
        method: 'get',
        url: apiUrl,
    });

    const data = response.data.data;
    if (response.data.code !== 0 || !data || !data.posts) {
        throw new Error(response.data.message || 'Failed to fetch data');
    }

    const posts = data.posts;
    const creatorName = posts.length > 0 ? posts[0].creatorName : domainName;

    const items = posts.map((post) => {
        let descriptionHtml = '';
        if (post.previewPicture) {
            descriptionHtml = `<p><img src="${post.previewPicture}" style="max-width: 100%; height: auto;"></p>`;
        }

        return {
            title: post.title,
            author: post.creatorName,
            pubDate: parseDate(Number.parseInt(post.createTime) * 1000),
            description: descriptionHtml,
            link: `${baseUrl}/posts/${post.postId}`,
        };
    });

    return {
        title: `${creatorName} - 引力圈`,
        link: `${baseUrl}/c/${domainName}`,
        description: `${creatorName} 的 引力圈 频道`,
        item: items,
    };
}
