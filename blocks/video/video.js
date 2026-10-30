/*
 * Video block (replaces videoKicker / videoSmall): poster with a play button that opens the
 * Brightcove player in a modal (scripts/video.js).
 *
 * DA authoring table (EDS library Video: one column; poster and link in the one cell):
 *
 * | Video                                                                               |
 * | poster image                                                                        |
 * |   https://players.brightcove.net/640445594001/1QVD66lj_default/index.html?videoId=… |
 * |   caption (optional), e.g. Building the case for healthy real estate webinar        |
 * |   [Transcript](…/transcript.srt) (optional)                                         |
 *
 * Content may also be split over several rows; it is read by kind, not by position.
 * The player link is the one to players.brightcove.net; any other link is the transcript.
 * Without a player link the block shows the poster and caption only.
 */
import { isVideoUrl, openVideo } from '../../scripts/video.js';
import { fetchPlaceholders, placeholder } from '../../scripts/placeholders.js';

/** Sorts the authored content into poster, player link, transcript link and caption nodes. */
function readContent(block) {
  const found = {
    picture: null, video: null, transcript: null, caption: [],
  };
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    [...cell.childNodes].forEach((node) => {
      if (node.nodeType === 3 && !node.textContent.trim()) return;
      const el = node.nodeType === 1 ? node : null;
      const picture = el && (el.matches('picture') ? el : el.querySelector('picture, img'));
      if (picture && !found.picture && !(el.textContent || '').trim()) {
        found.picture = picture.closest('picture') || picture;
        return;
      }
      const links = el ? [...(el.matches('a') ? [el] : el.querySelectorAll('a[href]'))] : [];
      const onlyLink = links.length === 1 && el.textContent.trim() === links[0].textContent.trim();
      if (onlyLink && isVideoUrl(links[0].getAttribute('href')) && !found.video) {
        [found.video] = links;
        return;
      }
      if (onlyLink && !found.transcript) {
        [found.transcript] = links;
        return;
      }
      found.caption.push(node);
    });
  });
  return found;
}

export default async function decorate(block) {
  const {
    picture, video, transcript, caption,
  } = readContent(block);
  const ph = await fetchPlaceholders();
  const figure = document.createElement('figure');
  figure.className = 'video-figure';

  const media = document.createElement(video ? 'button' : 'div');
  media.className = 'video-media';
  if (picture) media.append(picture);
  if (video) {
    media.type = 'button';
    const label = caption.map((n) => n.textContent.trim()).filter(Boolean).join(' ');
    const play = placeholder(ph, 'videoPlay', 'Play video');
    media.setAttribute('aria-label', label ? `${play}: ${label}` : play);
    media.setAttribute('aria-haspopup', 'dialog');
    const icon = document.createElement('span');
    icon.className = 'video-play-icon';
    icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.className = 'video-play-label';
    title.textContent = play;
    media.append(icon, title);
    media.addEventListener('click', () => openVideo({
      href: video.href,
      title: label,
      transcript: transcript ? transcript.href : '',
    }));
  }
  figure.append(media);

  if (caption.length) {
    const figcaption = document.createElement('figcaption');
    figcaption.className = 'video-caption';
    caption.forEach((n) => {
      if (n.nodeType === 1 && n.tagName === 'P') figcaption.append(...n.childNodes);
      else figcaption.append(n);
    });
    figure.append(figcaption);
  }
  block.replaceChildren(figure);
  if (!video && transcript) {
    // no player: the transcript stays a plain link under the poster
    const p = document.createElement('p');
    p.className = 'video-transcript';
    p.append(transcript);
    block.append(p);
  }
}
