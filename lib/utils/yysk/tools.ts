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
 * @param {number} [options.imageSize=0] - 生成图片的尺寸
 * @param {number} [options.targetCount=10] - 希望合成的目标图片数量
 * @returns {string} 预览图像的URL
 */
export async function buildPreviewImageUrl(name: string, id: string, imageUrls: string[], { imageSize = 0, targetCount = 10 } = {}): Promise<string> {
    const baseUrl = 'https://api.yyskweb.com/animate';
    const urlKey = process.env.ACCESS_KEY;
    const urlSize = imageSize > 0 ? `&size=${imageSize}` : '';
    const urlImages = getRepresentativeImages(imageUrls, targetCount).map((url) => encodeURIComponent(url));
    const previewImage = `${baseUrl}?name=${name}&id=${id}${urlSize}&urls=${urlImages.join(',')}&key=${urlKey}`;
    if (urlImages.length > 1) {
        const key = `img/${name}/${id}/preview.webp`;
        if (!(await redis.exists(key))) {
            axios.get(previewImage).catch(() => {});
        }
    }
    return previewImage;
}
