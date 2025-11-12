import type { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

// @ts-ignore
export const route: Route = {
    path: '/video/:queryWord/:limit?',
    handler,
};

async function handler(ctx) {
    const queryWord = ctx.req.param('queryWord');
    const limit = ctx.req.param('limit') ? Number.parseInt(ctx.req.param('limit')) : 100;

    const apiUrl = 'https://api.video.dmm.co.jp/graphql';
    const baseUrl = 'https://video.dmm.co.jp';

    // 使用搜索接口获取ID列表
    const searchQuery = `
        query TopSearch($limit: Int!, $offset: Int, $queryWord: String) {
            legacySearchPPV(
                limit: $limit
                offset: $offset
                queryWord: $queryWord
                sort: DELIVERY_START_DATE
                includeExplicit: true
                excludeUndelivered: true
            ) {
                result {
                    contents {
                        id
                    }
                }
            }
        }`;
    const searchResponse = await got({
        method: 'post',
        url: apiUrl,
        json: {
            query: searchQuery,
            variables: {
                limit,
                offset: 0,
                queryWord,
            },
        },
    });
    const contentIds = searchResponse.data.data.legacySearchPPV.result.contents;

    // 查询所有作品的详细信息
    const variables = {};
    const queryDefinitions = contentIds
        .map((content, index) => {
            variables[`id${index}`] = content.id;
            return `$id${index}: ID!`;
        })
        .join(', ');
    const queryBody = contentIds
        .map(
            (_content, index) => `
        work${index}: ppvContent(id: $id${index}) {
            ...contentFields
        }
    `
        )
        .join('\n');
    const detailQuery = `
        fragment contentFields on PPVContent {
            id
            makerContentId
            floor
            deliveryStartDate
            title
            description
            maker {
                id
                name
            }
            genres {
                id
                name
            }
            relatedWords
            packageImage {
                largeUrl
                mediumUrl
            }
            sampleImages {
                number
                largeImageUrl
            }
        }
        query MultipleContentPages(${queryDefinitions}) {
            ${queryBody}
        }
    `;
    const detailResponse = await got({
        method: 'post',
        url: apiUrl,
        json: {
            query: detailQuery,
            variables,
        },
    });
    const detailsData = detailResponse.data.data;

    // 处理返回的所有作品明细
    const items = contentIds.map((_content, index) => {
        const detailData = detailsData[`work${index}`];
        const imageUrls = detailData.sampleImages.map((img) => img.largeImageUrl);
        if (detailData.packageImage.largeUrl) {
            imageUrls.unshift(detailData.packageImage.largeUrl);
        }
        if (detailData.packageImage.mediumUrl) {
            imageUrls.unshift(detailData.packageImage.mediumUrl);
        }
        const imageHtmls = imageUrls.map((img) => `<p><img src="${img}" style="max-width: 100%; height: auto;"></p>`);
        const floor = detailData.floor.toLowerCase();
        const floorHtml = () => {
            let floorName = floor;
            switch (floor) {
                case 'av':
                    floorName = '视频';
                    break;
                case 'amateur':
                    floorName = '素人';
                    break;
                case 'cinema':
                    floorName = '成人电影';
                    break;
                case 'anime':
                    floorName = '动画';
                    break;
            }
            const floorUrl = `${baseUrl}/${floor}/list/?key=${encodeURIComponent(queryWord)}`;
            return `<strong><a href="${floorUrl}">#${floorName}</a></strong>`;
        };
        const genreHtmls = detailData.genres.map((genre) => {
            const genreName = genre.name;
            const genreUrl = `${baseUrl}/${floor}/list/?genre=${genre.id}`;
            return `<a href="${genreUrl}">#${genreName}</a>`;
        });
        const relatedWordHtmls = detailData.relatedWords.map((word) => {
            const wordUrl = `${baseUrl}/${floor}/list/?key=${encodeURIComponent(word)}`;
            return `<a href="${wordUrl}">#${word}</a>`;
        });
        const makerHtml = () => {
            const makerName = detailData.maker.name;
            const makerUrl = `${baseUrl}/${floor}/list/?maker=${detailData.maker.id}`;
            return `<strong><a href="${makerUrl}">@${makerName}</a></strong>`;
        };
        const numberHtml = () => {
            const numberUrlA = `https://www.javlibrary.com/cn/vl_searchbyid.php?keyword=${detailData.makerContentId}`;
            const numberUrlB = `https://www.jav321.com/video/${detailData.id}`;
            return [`<strong><a href="${numberUrlA}">@JAVLibrary</a></strong>`, `<strong><a href="${numberUrlB}">@JAV321</a></strong>`];
        };
        const tagHtmls = [makerHtml(), floorHtml(), ...genreHtmls, ...relatedWordHtmls, ...numberHtml()];
        return {
            title: `【${detailData.makerContentId}】${detailData.title}`,
            author: detailData.maker.name,
            pubDate: parseDate(detailData.deliveryStartDate),
            description: `
                <p>${tagHtmls.join(', ')}</p>
                <hr style="border: none; height: 1px; background-color: #000000;">
                <div>${imageHtmls.join('')}</div>
                <p>${detailData.description}</p>
            `,
            link: `${baseUrl}/${floor}/content/?id=${detailData.id}`,
            category: detailData.genres.map((g) => g.name),
        };
    });

    return {
        title: `FANZA视频-"${queryWord}"的搜索结果`,
        link: `${baseUrl}/list/?key=${encodeURIComponent(queryWord)}`,
        description: `FANZA上已发售的最新视频`,
        item: items,
    };
}
