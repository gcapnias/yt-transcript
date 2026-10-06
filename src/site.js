/**
 * The **Site** a fetch reaches (CONTEXT.md): YouTube or X.
 *
 * Everything about a fetch that differs by site is answered here, once, as a
 * small table: what `yt-dlp` prints, the flags it adds, how its outcome is
 * classified, and how a transcript is identified. The layers that fetch and
 * render are handed a site and ask it; none of them asks which site it has.
 *
 * Everything after the subtitle track is downloaded is the same for both:
 * cleaning, the frontmatter's seven keys, the store and the catalog.
 */

import { classifyFetch, classifyPostFetch } from './fetch-outcome.js';
import { transcriptSlug } from './slug.js';
import { postIdentity } from './x-post.js';

/**
 * @typedef {object} Site
 * @property {'youtube'|'x'} name
 * @property {string} printFields what the one invocation prints, as JSON
 * @property {string[]} extraArgs flags the site adds to that invocation
 * @property {(outcome: { exitCode: number, hasTrack: boolean, stderr?: string,
 *             metadata?: object|null }) => object} classify
 * @property {(fetched: { metadata: object|null, url: string, videoId: string|null,
 *             trackKind: 'auto'|'manual' }) => { url: string, collisionId: string,
 *             title: string, channel: string, trackKind: 'auto'|'manual',
 *             slug: string }} identify
 */

/** @type {Site} */
export const YOUTUBE = {
  name: 'youtube',
  printFields: 'title,channel,duration_string,upload_date',
  extraArgs: [],
  // Exit code and track only: a video's stderr is never read (`classifyFetch`).
  classify: ({ exitCode, hasTrack }) => classifyFetch({ exitCode, hasTrack }),
  identify({ metadata, url, videoId, trackKind }) {
    const title = metadata?.title ?? '';
    return {
      url,
      collisionId: videoId,
      title,
      channel: metadata?.channel ?? '',
      trackKind,
      slug: transcriptSlug(title, videoId),
    };
  },
};

/**
 * What an X post prints: the text, the channel (`uploader` is the display
 * name, `uploader_id` the handle), the post id (`display_id`; `id` is the media
 * id), which extractor answered, and the url it extracted from (`webpage_url`).
 * `title` carries the fetched video's rank when the post has multiple videos.
 * `channel` is absent on X, so it is not asked for.
 */
const POST_FIELDS =
  'title,description,uploader,uploader_id,display_id,extractor_key,webpage_url,duration_string,upload_date';

/**
 * An X post, fetched using its requested media selector.
 *
 * `--no-playlist` (always passed) is what makes `yt-dlp` honour a `/video/N`
 * suffix, but it does not stop X's extractor returning a multi-video or quote
 * post as a playlist and processing every entry; `--playlist-items 1` selects
 * the post's own first video, or the selected media entry.
 *
 * @returns {Site}
 */
export function xPost() {
  return {
    name: 'x',
    printFields: POST_FIELDS,
    extraArgs: ['--playlist-items', '1'],
    classify: ({ metadata, ...outcome }) =>
      classifyPostFetch({
        ...outcome,
        extractorKey: metadata?.extractorKey,
        uploaderId: metadata?.uploaderId,
        displayId: metadata?.displayId,
      }),
    // The identity comes from what yt-dlp reported, never from the url fetched
    // (ADR-0004), and every track is auto, whatever it looks like (ADR-0003).
    // The *cleaning* still follows what the track looks like: the recorded kind
    // is a claim about provenance, not a cleaning rule.
    identify: ({ metadata }) => ({ ...postIdentity(metadata ?? {}), trackKind: 'auto' }),
  };
}
