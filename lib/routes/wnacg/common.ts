import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import InvalidParameterError from '@/errors/types/invalid-parameter';

const categories = {
    1: '同人誌 漢化',
    2: '同人誌 CG畫集',
    3: '同人誌 Cosplay',
    5: '同人誌',
    6: '單行本',
    7: '雜誌&短篇',
    9: '單行本 漢化',
    10: '雜誌&短篇 漢化',
    12: '同人誌 日語',
    13: '單行本 日語',
    14: '雜誌&短篇 日語',
    16: '同人誌 English',
    17: '單行本 English',
    18: '雜誌&短篇 English',
    19: '韓漫',
    20: '韓漫 漢化',
    21: '韓漫 生肉',
    22: '同人誌 3D漫畫',
};

const categoriesReverse = {
    '同人誌 漢化': 1,
    '同人誌 CG畫集': 2,
    '寫真 & Cosplay': 3,
    同人誌: 5,
    單行本: 6,
    '雜誌&短篇': 7,
    '單行本 漢化': 9,
    '雜誌&短篇 漢化': 10,
    '同人誌 日語': 12,
    '單行本 日語': 13,
    '雜誌&短篇 日語': 14,
    '同人誌 English': 16,
    '單行本 English': 17,
    '雜誌&短篇 English': 18,
    韓漫: 19,
    '韓漫 漢化': 20,
    '韓漫 生肉': 21,
    '3D&漫畫': 22,
    '3D&漫畫 漢化': 22,
};

const baseUrl = 'https://www.wnacg.com';
const shoucangUrl = `/themes/weitu/images/bg/shoucang.jpg`;
const userAgent = 'YYSK-RSSHUB/1.0 (yysk.mygo@gmail.com)';

export async function handler(ctx) {
    const { cid, tag, search } = ctx.req.param();
    if (cid && !Object.keys(categories).includes(cid)) {
        throw new InvalidParameterError('此分类不存在');
    }

    const url: string = search ? `${baseUrl}/search?q=${encodeURIComponent(search)}&f=_all&s=create_time_DESC&syn=yes` : `${baseUrl}/albums${cid ? `-index-cate-${cid}` : ''}${tag ? `-index-tag-${tag}` : ''}.html`;
    const { data } = await got(url, {
        headers: {
            'user-agent': userAgent,
            referer: baseUrl,
        },
    });
    const $ = load(data);

    const list = $('.gallary_item')
        .toArray()
        .map((item) => {
            item = $(item);
            const href = item.find('a').attr('href');
            const aid = href.match(/^\/photos-index-aid-(\d+)\.html$/)[1];
            return {
                title: item.find('a').attr('title'),
                link: `${baseUrl}${href}`,
                pubDate: parseDate(
                    item
                        .find('.info_col')
                        .text()
                        .match(/\d{4}-\d{2}-\d{2}/)?.[0],
                    'YYYY-MM-DD'
                ),
                aid,
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const { data: descRes } = await got(item.link, {
                    headers: {
                        referer: encodeURI(url),
                    },
                });
                let $ = load(descRes);
                const author = $('.uwuinfo p').first().text();
                const category = $('.tagshow')
                    .toArray()
                    .map((item) => $(item).text());
                $('.addtags').remove();
                const types = $('.uwconn label:contains("分類：")')
                    .text()
                    .replace(/^分類：/, '')
                    .trim()
                    .split('／');
                const description = $('.uwconn p')
                    .html()
                    ?.replace(/^簡介：/, '')
                    .trim();

                const authorHtml = () => {
                    const authorUrl = `${baseUrl}/search?q=${encodeURIComponent(author)}&syn=yes&f=user_nicename&s=create_time_DESC`;
                    return `<strong><a href="${authorUrl}">@${author}</a></strong>`;
                };
                const typeHtmls = types.map((type) => {
                    let targetId = null;
                    if (categoriesReverse[type]) {
                        targetId = categoriesReverse[type];
                    } else {
                        const parentType = types.find((otherType) => categoriesReverse[`${otherType} ${type}`]);
                        if (parentType) {
                            targetId = categoriesReverse[`${parentType} ${type}`];
                        }
                    }
                    if (targetId) {
                        const typeUrl = `${baseUrl}/albums-index-cate-${targetId}.html`;
                        return `<strong><a href="${typeUrl}">#${type}</a></strong>`;
                    } else {
                        return `<strong>#${type}</strong>`;
                    }
                });
                const categoryHtmls = category.map((cat) => {
                    const catUrl = `${baseUrl}/albums-index-tag-${encodeURIComponent(cat)}.html`;
                    return `<a href="${catUrl}">#${cat}</a>`;
                });
                const tagHtmls = [authorHtml(), ...typeHtmls, ...categoryHtmls];

                const { data } = await got(`${baseUrl}/photos-gallery-aid-${item.aid}.html`, {
                    headers: {
                        referer: `${baseUrl}/photos-slide-aid-${item.aid}.html`,
                    },
                });
                $ = load(data);

                const imgListMatch = $('script')
                    .text()
                    .match(/var imglist = (\[.*]);"\);/)[1];

                const imgList = JSON.parse(imgListMatch.replaceAll('url:', '"url":').replaceAll('caption:', '"caption":').replaceAll('fast_img_host+\\', '').replaceAll('\\', '')).filter((img) => img.url !== shoucangUrl);
                const imageHtmls = imgList.map((img) => `<img src="https:${img.url}" style="max-width: 100%; height: auto;">`);

                item.title = `${imgList.length}P | ${item.title}`;
                item.author = author;
                item.category = category;
                item.description = `
                    <p>${tagHtmls.join(', ')}</p>
                    <hr style="border: none; height: 1px; background-color: #000000;">
                    <p>${description}</p>
                    <div>${imageHtmls.slice(0, 50).join('')}</div>
                `;
                return item;
            })
        )
    );

    return {
        title: $('head title').text(),
        link: url,
        item: items,
    };
}
