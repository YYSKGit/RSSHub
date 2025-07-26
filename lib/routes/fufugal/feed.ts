import type { Route } from '@/types';
import axios from 'axios';
import { parseDate } from '@/utils/parse-date';
import md5 from '@/utils/md5';

// @ts-ignore
export const route: Route = {
    path: '/galgame',
    handler,
};

async function handler() {
    const rootUrl = 'https://www.fufugal.com';
    const imgUrl = 'https://img.llgal.xyz';
    const loginUrl = `${rootUrl}/sign`;
    const listUrl = `${rootUrl}/gameLists?yema=0`;

    // 1. 获取凭据
    const email = process.env.FUFUGAL_EMAIL;
    const password = process.env.FUFUGAL_PASSWORD;
    if (!email || !password) {
        throw new Error('请先通过环境变量配置邮箱和密码');
    }

    // 2. 登录并获取 Cookie
    const loginData = new URLSearchParams();
    loginData.append('email', email);
    loginData.append('password', md5(password));
    const loginResponse = await axios.post(loginUrl, loginData, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
    if (loginResponse.data.code !== 0) {
        throw new Error(`登录失败: ${loginResponse.data.msg}`);
    }
    const cookie = loginResponse.headers['set-cookie']?.map((c: string) => c.split(';')[0]).join('; ');
    if (!cookie) {
        throw new Error('登录成功但未能获取到 Cookie');
    }

    // 3. 使用 Cookie 获取文章列表
    const listResponse = await axios.get(listUrl, {
        headers: {
            Cookie: cookie,
            Accept: 'application/json, text/plain, */*',
        },
    });
    if (listResponse.data.code !== 0) {
        throw new Error(`获取文章列表失败: ${listResponse.data.msg}`);
    }

    // 4. 解析文章列表
    const items = listResponse.data.obj.map((item) => {
        const tags = item.game_label.split(',');
        return {
            title: item.game_name,
            link: `${rootUrl}/detail?id=${item.game_id}`,
            guid: `${rootUrl}/detail?id=${item.game_id}`,
            pubDate: parseDate(item.game_create_time),
            author: tags.find((l: string) => l.startsWith('品牌：'))?.replace('品牌：', '') || '未知',
            category: tags,
            description: `
                <p>${tags.map((tag: string) => `#${tag.trim()}`).join(', ')}</p>
                <hr style="border: none; height: 1px; background-color: #000000;">
                <p>${item.game_introduce.replaceAll('<br/>', '<br>')}</p>
                <div><img src="${imgUrl}${item.game_img}" style="max-width: 100%; height: auto;"></div>
            `,
        };
    });

    return {
        title: '初音的青葱-Galgame',
        link: rootUrl,
        description: '初音的青葱的最新Galgame文章',
        item: items,
    };
}
