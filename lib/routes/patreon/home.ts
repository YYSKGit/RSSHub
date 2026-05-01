import { Route } from '@/types';
import { MediaRelation, PostData } from './types';

import { config } from '@/config';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';

import { buildHeaderImageUrl } from '@/utils/yysk/tools';

export const route: Route = {
    path: '/home',
    categories: ['new-media'],
    example: '/patreon/home',
    parameters: {},
    features: {
        requireConfig: [
            {
                name: 'PATREON_SESSION_ID',
                optional: false,
                description: 'The value of the session_id cookie after logging in to Patreon, required to access home timeline',
            },
        ],
        nsfw: true,
    },
    radar: [
        {
            source: ['patreon.com/home'],
        },
    ],
    name: 'Home Timeline',
    maintainers: ['YYSK'],
    handler,
};

function parsePatreonJsonContent(jsonString: string): string {
    if (!jsonString) {return '';}
    try {
        const data = JSON.parse(jsonString);
        function renderNode(node: any): string {
            if (node.type === 'text') {
                let text = node.text;
                if (node.marks) {
                    for (const mark of node.marks) {
                        if (mark.type === 'bold') {text = `<strong>${text}</strong>`;}
                        if (mark.type === 'italic') {text = `<em>${text}</em>`;}
                        if (mark.type === 'underline') {text = `<u>${text}</u>`;}
                        if (mark.type === 'link') {text = `<a href="${mark.attrs?.href}" target="_blank">${text}</a>`;}
                    }
                }
                return text;
            }
            const children = (node.content || [])
                .map((n: any) => renderNode(n))
                .join('')
                .trim();
            switch (node.type) {
                case 'paragraph':
                    return children ? `<p>${children}</p>` : '';
                case 'bulletList':
                    return children ? `<ul>${children}</ul>` : '';
                case 'orderedList':
                    return children ? `<ol>${children}</ol>` : '';
                case 'listItem':
                    return children ? `<li>${children}</li>` : '';
                case 'heading':
                    return children ? `<h${node.attrs?.level || 2}>${children}</h${node.attrs?.level || 2}>` : '';
                case 'blockquote':
                    return children ? `<blockquote>${children}</blockquote>` : '';
                case 'hardBreak':
                    return `<br>`;
                case 'doc':
                    return children;
                default:
                    return children;
            }
        }
        return renderNode(data);
    } catch {
        return '';
    }
}

async function handler() {
    if (!config.patreon || !config.patreon.sessionId) {
        throw new Error('Patreon home timeline requires PATREON_SESSION_ID to be configured in environment variables.');
    }

    const headers = {
        Cookie: `session_id=${config.patreon.sessionId}`,
    };

    const posts = await ofetch<PostData>('https://www.patreon.com/api/posts/latest', {
        headers,
        query: {
            include:
                'campaign,access_rules,access_rules.tier.null,attachments_media,audio,audio_preview.null,drop,images,media,native_video_insights,poll.choices,poll.current_user_responses.user,poll.current_user_responses.choice,poll.current_user_responses.poll,user,user_defined_tags,ti_checks,video.null,content_unlock_options.product_variant.null',
            'fields[campaign]': 'currency,show_audio_post_download_links,avatar_photo_url,avatar_photo_image_urls,earnings_visibility,is_nsfw,is_monthly,name,url',
            'fields[post]':
                'change_visibility_at,comment_count,commenter_count,content,content_json_string,content_teaser_text,created_at,current_user_can_comment,current_user_can_delete,current_user_can_report,current_user_can_view,current_user_comment_disallowed_reason,current_user_has_liked,embed,image,insights_last_updated_at,is_paid,like_count,meta_image_url,min_cents_pledged_to_view,monetization_ineligibility_reason,post_file,post_metadata,published_at,patreon_url,post_type,pledge_url,preview_asset_type,thumbnail,thumbnail_url,teaser_text,title,upgrade_url,url,was_posted_by_campaign_owner,has_ti_violation,moderation_status,post_level_suspension_removal_date,pls_one_liners_by_category,video,video_preview,view_count,content_unlock_options,is_new_to_current_user,watch_state',
            'fields[post_tag]': 'tag_type,value',
            'fields[user]': 'image_url,full_name,url',
            'fields[access_rule]': 'access_rule_type,amount_cents',
            'fields[media]': 'id,image_urls,display,download_url,metadata,file_name',
            'fields[native_video_insights]': 'average_view_duration,average_view_pct,has_preview,id,last_updated_at,num_views,preview_views,video_duration',
            'fields[content-unlock-option]': 'content_unlock_type',
            'fields[product-variant]': 'price_cents,currency_code,checkout_url,is_hidden,published_at_datetime,content_type,orders_count,access_metadata',
            'filter[include_lives]': true,
            sort: '-published_at',
            'page[count]': 20,
            'json-api-use-default-includes': false,
            'json-api-version': '1.0',
        },
    });

    const items = posts.data.map(({ attributes, relationships }) => {
        for (const [key, value] of Object.entries(relationships)) {
            if (value.data) {
                relationships[key] = Array.isArray(value.data) ? value.data.map((item) => posts.included.find((i) => i.id === item.id)) : posts.included.find((i) => i.id === value.data.id);
            }
        }
        if (attributes.video_preview) {
            relationships.video_preview = posts.included.find((i) => Number.parseInt(i.id) === attributes.video_preview?.media_id) as unknown as MediaRelation;
        }

        const images =
            attributes.post_type === 'image_file' ? ((attributes.post_metadata.image_order || []).map((id) => posts.included.find((item) => item.id === id)?.attributes.image_urls?.original).filter(Boolean) as string[]) : [];
        const postId = attributes.url.match(/-(\d+)$/)?.[1] ?? '';
        const buildOptions = {
            imageSize: 400,
            targetColumn: 2,
            waterfallTargetCount: 50,
        };
        const headerImages = images.length > 0 ? buildHeaderImageUrl('patreon', postId, images, buildOptions) : [];
        const creatorName = relationships.campaign?.attributes?.name || 'Unknown Creator';
        const imgPrefix = relationships.images?.length ? `${relationships.images.length}P | ` : '';
        const rawTitle = attributes.title || 'Untitled Post';

        if (!attributes.content && attributes.content_json_string) {
            attributes.content = parsePatreonJsonContent(attributes.content_json_string);
        }
        if (!attributes.teaser_text && attributes.content_teaser_text) {
            attributes.teaser_text = attributes.content_teaser_text;
        }
        if (headerImages.length > 0) {
            attributes.post_metadata.image_order = [];
        }

        return {
            title: `${imgPrefix}${rawTitle}`,
            description: art(path.join(__dirname, 'templates/description.art'), {
                attributes,
                relationships,
                included: posts.included,
                headerImages,
            }),
            link: attributes.url,
            author: creatorName,
            pubDate: parseDate(attributes.published_at),
            image: attributes.thumbnail?.url ?? attributes.image?.url,
            category: relationships.user_defined_tags?.map((tag) => tag.attributes.value),
        };
    });

    return {
        title: 'Patreon - Home Timeline',
        description: 'Latest posts from creators you support on Patreon.',
        link: 'https://www.patreon.com/home',
        item: items,
        allowEmpty: true,
    };
}
