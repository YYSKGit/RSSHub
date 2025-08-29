import axios from 'axios';

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
 * @param {number} [targetCount=10] - 希望合成的目标图片数量
 * @returns {string} 预览图像的URL
 */
export function buildPreviewImageUrl(name: string, id: string, imageUrls: string[], targetCount: number = 10): string {
    const baseUrl = 'https://api.yyskweb.com/animate';
    const urlKey = 'webmm002132';
    const showImages = getRepresentativeImages(imageUrls, targetCount)
        .map((url) => encodeURIComponent(url))
        .join(',');
    const previewImage = `${baseUrl}?name=${name}&id=${id}&urls=${showImages}&key=${urlKey}`;
    axios.get(previewImage);
    return previewImage;
}
