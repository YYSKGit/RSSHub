import { getSubPath } from '@/utils/common-utils';
import got from '@/utils/got';
import { load } from 'cheerio';
import timezone from '@/utils/timezone';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import dayjs from 'dayjs';

const rootUrl = 'https://www.dlsite.com';

const defaultFilters = {
    per_page: 100,
    show_type: 1,
    show_layout: 1,
};

const formatDate = (date, format) => dayjs(date).format(format);

const addFilters = (url, filters) => {
    const keys = Object.keys(filters);
    const filterStr = keys.map((k) => `/${k}/${filters[k]}`).join('');
    const newUrl = url.replaceAll(new RegExp(`(/${keys.join(String.raw`/\w+|/`)}/\\w+)`, 'g'), '');
    return `${newUrl}${/=/.test(newUrl) ? '' : '/='}${filterStr}`;
};

const getDetails = async (works) => {
    const apiUrl = `${rootUrl}/home-touch/product/info/ajax?product_id=${works}`;

    const detailResponse = await got({
        method: 'get',
        url: apiUrl,
    });

    return detailResponse.data;
};

const ProcessItems = async (ctx) => {
    art.defaults.imports.formatDate = formatDate;

    const subPath = getSubPath(ctx) === '/' ? '/home/new' : getSubPath(ctx);

    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 100;

    const currentUrl = `${rootUrl}${addFilters(subPath, defaultFilters)}?locale=zh_CN`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const $ = load(response.data);

    const works = $('dt.work_name').slice(0, limit);

    const details = await getDetails(
        works
            .toArray()
            .map(
                (item) =>
                    $(item)
                        .find('a')
                        .attr('href')
                        .match(/_id\/(.*?)\.html/)[1]
            )
            .join(',')
    );

    const items = works.toArray().map((item) => {
        item = $(item).parentsUntil('tbody, ul');

        const a = item.find('.work_name a');

        const title = a.text();
        const link = a.attr('href');
        const guid = link.match(/_id\/(.*?)\.html/)[1];

        const description = item.find('.work_text').text();
        const authors = item
            .find('.maker_name a')
            .toArray()
            .map((a) => ({
                name: $(a).text(),
                link: $(a).attr('href'),
            }));
        let images = item.find('div[data-samples]').length === 0 ? [] : JSON.parse(item.find('div[data-samples]').attr('data-samples').replaceAll("'", '"')).map((s) => s.thumb);

        const workCategories = item
            .find('.work_category')
            .find('a')
            .toArray()
            .map((i) => ({
                text: $(i).text(),
                link: $(i).attr('href'),
            }));

        const workGenres = item
            .find('.work_genre')
            .find('span[title]')
            .toArray()
            .map((i) => ({
                text: $(i).text(),
            }));

        const searchTags = item
            .find('.search_tag')
            .find('a')
            .toArray()
            .map((i) => ({
                text: $(i).text(),
                link: $(i).attr('href'),
            }));

        const nameTags = item
            .find('.icon_wrap')
            .find('span[title]')
            .toArray()
            .map((i) => ({
                text: $(i).text(),
            }));

        const detail = details[guid];

        const pubDate = timezone(parseDate(detail.regist_date), +9);
        images = images.length === 0 ? [detail.work_image] : images;
        images = images.map((img: string) => `<img src="https:${img}" style="max-width: 100%; height: auto;" />`);

        const authorsLinks = authors.map((author: { link: string; name: string }) => `<strong><a href="${author.link}">@${author.name}</a></strong>`);
        const categoryLinks = workCategories.map((tag: { text: string; link: string }) => {
            const tagName = tag.text;
            const tagUrl = tag.link;
            return `<strong><a href="${tagUrl}">#${tagName}</a></strong>`;
        });
        const genreLinks = workGenres.map((tag: { text: string }) => {
            const tagName = tag.text;
            return `<strong>#${tagName}</strong>`;
        });
        const tagLinks = searchTags.map((tag: { text: string; link: string }) => {
            const tagName = tag.text;
            const tagUrl = tag.link;
            return `<a href="${tagUrl}">#${tagName}</a>`;
        });
        const showTags = [...authorsLinks, ...categoryLinks, ...genreLinks, ...tagLinks];

        return {
            title: title.trim(),
            link,
            pubDate,
            author: authors.map((a) => a.name).join(' / '),
            category: [...workCategories.map((i) => i.text), ...workGenres.map((i) => i.text), ...searchTags.map((i) => i.text), ...nameTags.map((i) => i.text)],
            guid: `dlsite-${guid}`,
            description: `
                <p>${showTags.join(', ')}</p>
                <hr style="border: none; height: 1px; background-color: #000000;">
                <p>${description}</p>
                <div>${images.join('<br>')}</div>
            `,
        };
    });

    return {
        title: $('title').text(),
        description: $('meta[name="description"]').attr('content'),
        link: currentUrl,
        item: items,
        allowEmpty: true,
    };
};

export { ProcessItems };
