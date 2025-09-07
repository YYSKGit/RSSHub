import axios from 'axios';
import axiosRetry from 'axios-retry';
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const apiClient = axios.create({
    headers: {
        'User-Agent': 'rsshub-axios',
    },
    timeout: 15 * 1000,
});

axiosRetry(apiClient, {
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000,
    retryCondition: (error) => axiosRetry.isNetworkOrIdempotentRequestError(error),
});

/**
 * buildHeaderImageUrl 函数的选项
 */
type BuildHeaderImageUrlOptions = {
    // 预览图 (Animate) 的选项
    imageSize?: number;
    imageDuration?: number;
    transitionDuration?: number;
    imageFPS?: number;
    previewTargetCount?: number;

    // 瀑布流 (Waterfall) 的选项
    imageWidth?: number;
    targetColumn?: number;
    waterfallTargetCount?: number;
};

/**
 * 批量预热请求，将多次 Redis 查询合并为一次
 * @param items 一个包含 key 和 url 的对象数组
 */
async function batchPrewarmRequests(items: { key: string; url: string }[]) {
    if (items.length === 0) {
        return;
    }

    // 使用 mget 一次性从 Redis 查询所有 key 的值
    // mget 会返回一个值的数组，如果 key 不存在，对应位置的值为 null
    const keys = items.map((item) => item.key);
    const existingValues = await redis.mget(keys);
    const requestsToMake = items.filter((_, index) => existingValues[index] === null);

    if (requestsToMake.length === 0) {
        return;
    }

    const prewarmPromises = requestsToMake.map((item) => apiClient.get(item.url).catch(() => {}));
    await Promise.allSettled(prewarmPromises);
}

/**
 * 从一个图片URL数组中，智能筛选出指定数量的代表性图片。
 * 该算法确保返回的图片在原数组中均匀分布，并且总是包含第一张和最后一张图片。
 * @param {string[]} imageUrls - 原始图片URL数组。
 * @param {number} [targetCount=10] - 希望得到的目标图片数量。
 * @returns {string[]} 筛选后的、唯一的图片URL数组。
 */
function getRepresentativeImages(imageUrls: string[], targetCount: number = 10): string[] {
    if (!imageUrls || imageUrls.length === 0 || targetCount <= 0) {
        return [];
    }
    if (imageUrls.length <= targetCount) {
        return [...imageUrls];
    }
    if (targetCount === 1) {
        return [imageUrls[0]];
    }

    const result: string[] = [];
    const totalItems = imageUrls.length;
    const lastIndex = totalItems - 1;

    for (let i = 0; i < targetCount; i++) {
        const ratio = i / (targetCount - 1);
        const index = Math.round(ratio * lastIndex);
        result.push(imageUrls[index]);
    }

    return [...new Set(result)];
}

/**
 * 构建头部图像（预览动图和瀑布流图）的URL数组
 * @param {string} name - 图像名称
 * @param {string} id - 图像ID
 * @param {string[]} imageUrls - 原始图片URL数组
 * @param {BuildHeaderImageUrlOptions} options - 包含所有类型图像的配置选项
 * @returns {string[]} 返回一个包含两个URL的数组: [previewImageUrl, waterfallImageUrl]
 */
export function buildHeaderImageUrl(name: string, id: string, imageUrls: string[], options: BuildHeaderImageUrlOptions = {}): string[] {
    const API_BASE = 'https://api.yyskweb.com';
    const accessKey = process.env.ACCESS_KEY ?? '';
    const prewarmItems: { key: string; url: string }[] = [];

    /**
     * 内部通用的URL构建逻辑
     * @param {'preview' | 'waterfall'} type - 要构建的URL类型
     */
    const buildUrl = (type: 'preview' | 'waterfall'): string => {
        const params = new URLSearchParams({ name, id });
        let baseUrl = '';
        let selectedImages: string[] = [];
        let prewarmKey = '';

        if (type === 'preview') {
            // --- 预览图 (Animate) 的逻辑 ---
            const { imageSize = 0, imageDuration = 0, transitionDuration = 0, imageFPS = 0, previewTargetCount = 10 } = options;

            baseUrl = `${API_BASE}/animate`;
            prewarmKey = `img/${name}/${id}/preview.webp`;

            if (imageSize > 0) {params.append('size', imageSize.toString());}
            if (imageDuration > 0) {params.append('iDur', imageDuration.toString());}
            if (transitionDuration > 0) {params.append('tDur', transitionDuration.toString());}
            if (imageFPS > 0) {params.append('fps', imageFPS.toString());}

            selectedImages = getRepresentativeImages(imageUrls, previewTargetCount);
        } else {
            // --- 瀑布流图 (Waterfall) 的逻辑 ---
            const { imageWidth = 0, targetColumn = 0, waterfallTargetCount = 50 } = options;

            baseUrl = `${API_BASE}/waterfall`;
            prewarmKey = `img/${name}/${id}/waterfall.webp`;

            if (imageWidth > 0) {params.append('width', imageWidth.toString());}
            if (targetColumn > 0) {params.append('column', targetColumn.toString());}

            selectedImages = imageUrls.slice(0, waterfallTargetCount);
        }

        // --- 通用逻辑 ---
        if (selectedImages.length > 0) {
            const { prefix, files, suffix } = compressUrlList(selectedImages);
            params.append('prefix', prefix);
            params.append('files', files);
            params.append('suffix', suffix);
        }
        params.append('key', accessKey);

        const finalUrl = `${baseUrl}?${params.toString()}`;

        if (selectedImages.length > 1) {
            prewarmItems.push({ key: prewarmKey, url: finalUrl });
        }

        return finalUrl;
    };

    const previewImageUrl = buildUrl('preview');
    const waterfallImageUrl = buildUrl('waterfall');
    batchPrewarmRequests(prewarmItems);

    return [previewImageUrl, waterfallImageUrl];
}

/**
 * 压缩 URL 列表，提取公共前后缀
 * @param {string[]} urls - 原始 URL 数组
 * @returns {{prefix: string, files: string, suffix: string}} 压缩后的 URL 组件
 */
function compressUrlList(urls: string[]): { prefix: string; files: string; suffix: string } {
    if (!urls || urls.length === 0) {
        return { prefix: '', files: '', suffix: '' };
    }
    if (urls.length === 1) {
        return { prefix: urls[0], files: '', suffix: '' };
    }

    // 1. 查找公共前缀
    let prefix = '';
    const firstUrl = urls[0];
    for (const [i, char] of [...firstUrl].entries()) {
        if (urls.every((url) => url.length > i && url[i] === char)) {
            prefix += char;
        } else {
            break;
        }
    }

    // 如果所有 URL 完全相同，直接返回
    if (prefix.length === firstUrl.length && urls.every((url) => url === firstUrl)) {
        return { prefix, files: '', suffix: '' };
    }

    // 2. 基于移除前缀后的剩余部分来计算后缀
    const remainders = urls.map((url) => url.slice(prefix.length));
    const firstRemainder = remainders[0];
    const minRemainderLength = Math.min(...remainders.map((r) => r.length));

    // 从后往前遍历查找公共后缀
    let suffix = '';
    for (let i = 1; i <= minRemainderLength; i++) {
        const char = firstRemainder[firstRemainder.length - i];
        if (remainders.every((r) => r[r.length - i] === char)) {
            suffix = char + suffix;
        } else {
            break;
        }
    }

    // 3. 提取中间文件部分
    const files = remainders.map((r) => r.slice(0, Math.max(0, r.length - suffix.length)));
    const encodedFiles = files.map((f) => encodeURIComponent(f));

    return { prefix, files: encodedFiles.join('|'), suffix };
}
