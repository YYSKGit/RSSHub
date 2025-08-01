import axios from 'axios';

/**
 * 获取用户的发现页面插画
 * @param {string} cookie pixiv cookie
 * @param {number} limit 返回的插画数量限制
 * @returns {Promise<got.AxiosResponse<{illusts: illust[]}>>}
 */
export default function getUserIllustDiscovery(cookie: string, limit: number) {
    return axios.get('https://www.pixiv.net/ajax/discovery/artworks', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            Cookie: cookie,
        },
        params: {
            limit,
            mode: 'r18',
            lang: 'zh',
        },
    });
}
