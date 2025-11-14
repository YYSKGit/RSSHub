import * as crypto from 'node:crypto';

/**
 * 根据 ASCII 值映射到切片数量
 */
function mapModToSliceCount(modVal: number): number {
    switch (modVal) {
        case 0:
            return 2;
        case 1:
            return 4;
        case 2:
            return 6;
        case 3:
            return 8;
        case 4:
            return 10;
        case 5:
            return 12;
        case 6:
            return 14;
        case 7:
            return 16;
        case 8:
            return 18;
        case 9:
            return 20;
        default:
            return 10;
    }
}

/**
 * 计算单个页面的切片数量
 * @param gid 画廊 ID (字符串)
 * @param pageNumStr 格式化后的页码 (例如 '00001', '00003', '00020')
 */
export function getSliceCount(gid: string, pageNumStr: string): number {
    // 1. 将画廊 ID 转换为整数，用于后续的条件判断
    const gid_int = Number.parseInt(gid, 10);

    // 2. 拼接字符串
    const concat_str = gid + pageNumStr;

    // 3. MD5 哈希
    const hash = crypto.createHash('md5').update(concat_str).digest('hex');

    // 4. 取最后一位字符并获取其 ASCII 码
    const last_char = hash.slice(-1);
    const ascii_val = last_char.charCodeAt(0);

    // 5. 条件取模
    let mod_val = ascii_val; // 默认值 (gid < 268850 时)

    if (gid_int >= 268850 && gid_int <= 421925) {
        mod_val = ascii_val % 10;
    } else if (gid_int >= 421926) {
        mod_val = ascii_val % 8;
    }

    // 6. 映射到最终的切片数量
    return mapModToSliceCount(mod_val);
}
