import axios from 'axios';
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

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
 * 构建预览图像的URL
 * @param {string} name - 动图名称
 * @param {string} id - 动图ID
 * @param {string[]} imageUrls - 原始图片URL数组
 * @param {Object} options - 选项
 * @param {number} [options.imageSize=0] - 生成图片的长宽尺寸
 * @param {number} [options.imageDuration=0] - 动图的显示时长，单位为秒
 * @param {number} [options.transitionDuration=0] - 动图的过渡时长，单位为秒
 * @param {number} [options.imageFPS=0] - 动图的帧率
 * @param {number} [options.targetCount=10] - 希望合成的目标图片数量
 * @returns {string} 预览图像的URL
 */
export async function buildPreviewImageUrl(name: string, id: string, imageUrls: string[], { imageSize = 0, imageDuration = 0, transitionDuration = 0, imageFPS = 0, targetCount = 10 } = {}): Promise<string> {
    const params = new URLSearchParams({ name, id });

    if (imageSize > 0) {
        params.append('size', imageSize.toString());
    }
    if (imageDuration > 0) {
        params.append('iDur', imageDuration.toString());
    }
    if (transitionDuration > 0) {
        params.append('tDur', transitionDuration.toString());
    }
    if (imageFPS > 0) {
        params.append('fps', imageFPS.toString());
    }

    const urlImages = getRepresentativeImages(imageUrls, targetCount);
    const { prefix, files, suffix } = compressUrlList(urlImages);
    params.append('prefix', prefix);
    params.append('files', files);
    params.append('suffix', suffix);
    params.append('key', process.env.ACCESS_KEY ?? '');

    const baseUrl = 'https://api.yyskweb.com/animate';
    const previewImage = `${baseUrl}?${params.toString()}`;
    if (urlImages.length > 1) {
        const key = `img/${name}/${id}/preview.webp`;
        if (!(await redis.exists(key))) {
            axios
                .get(previewImage, {
                    headers: {
                        'User-Agent': 'rsshub-axios',
                    },
                })
                .catch(() => {});
        }
    }
    return previewImage;
}

/**
 * 构建瀑布流图像的URL
 * @param {string} name - 瀑布图名称
 * @param {string} id - 瀑布图ID
 * @param {string[]} imageUrls - 原始图片URL数组
 * @param {Object} options - 选项
 * @param {number} [options.imageWidth=0] - 生成图片的宽度
 * @param {number} [options.targetCount=50] - 希望合成的目标图片数量
 * @returns {string} 瀑布流图像的URL
 */
export async function buildWaterfallImageUrl(name: string, id: string, imageUrls: string[], { imageWidth = 0, targetCount = 50 } = {}): Promise<string> {
    const params = new URLSearchParams({ name, id });

    if (imageWidth > 0) {
        params.append('width', imageWidth.toString());
    }

    const urlImages = imageUrls.slice(0, targetCount);
    const { prefix, files, suffix } = compressUrlList(urlImages);
    params.append('prefix', prefix);
    params.append('files', files);
    params.append('suffix', suffix);
    params.append('key', process.env.ACCESS_KEY ?? '');

    const baseUrl = 'https://api.yyskweb.com/waterfall';
    const previewImage = `${baseUrl}?${params.toString()}`;
    if (urlImages.length > 1) {
        const key = `img/${name}/${id}/waterfall.webp`;
        if (!(await redis.exists(key))) {
            axios
                .get(previewImage, {
                    headers: {
                        'User-Agent': 'rsshub-axios',
                    },
                })
                .catch(() => {});
        }
    }
    return previewImage;
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
