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
 * The player link is the one to players.brightcove.net; any other link in its own paragraph
 * is the transcript. A bulleted list of links (e.g. "Download transcript (PDF)") is shown as
 * links under the poster. Without a player link the block shows the poster and caption only.
 *
 * The caption sits on the poster under the play button (live videoSmall, every live video).
 * Variant small (a video in a column): the column sets the width. Two side by side: put them in
 * one section with Section Metadata Layout 6-6.
 */
import { isVideoUrl, openVideo } from '../../scripts/video.js';
import { fetchPlaceholders, placeholder } from '../../scripts/placeholders.js';

/** Sorts the authored content into poster, player link, transcript link and caption nodes. */
function readContent(block) {
  const found = {
    picture: null, video: null, transcript: null, caption: [], links: null,
  };
  const isLinkList = (el) => el && el.matches('ul, ol') && el.children.length
    && [...el.children].every((li) => {
      const a = li.querySelector('a[href]');
      return a && li.textContent.trim() === a.textContent.trim();
    });
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    [...cell.childNodes].forEach((node) => {
      if (node.nodeType === 3 && !node.textContent.trim()) return;
      const el = node.nodeType === 1 ? node : null;
      const picture = el && (el.matches('picture') ? el : el.querySelector('picture, img'));
      if (picture && !found.picture && !(el.textContent || '').trim()) {
        found.picture = picture.closest('picture') || picture;
        return;
      }
      if (isLinkList(el) && !found.links) {
        found.links = el;
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
    picture, video, transcript, caption, links,
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
    // the caption is part of the poster (inside the button, after the play label)
    const text = document.createElement('span');
    text.className = 'video-caption';
    caption.forEach((n) => {
      if (n.nodeType === 1 && n.tagName === 'P') text.append(...n.childNodes);
      else text.append(n);
    });
    media.append(text);
  }
  block.replaceChildren(figure);
  if (links) {
    links.classList.add('video-links');
    block.append(links);
  }
  if (!video && transcript) {
    // no player: the transcript stays a plain link under the poster
    const p = document.createElement('p');
    p.className = 'video-transcript';
    p.append(transcript);
    block.append(p);
  }
}
