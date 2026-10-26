/*
 * Social Links block (replaces social): "Stay connected" link tiles.
 *
 * DA authoring table (one row per network):
 *
 * | Social Links |                                                                       |
 * | icon image (LinkedIn svg) | link "Manulife Investment Management" → https://www.linkedin.com/company/… |
 */
export default function decorate(block) {
  const ul = document.createElement('ul');
  ul.className = 'social-links-list';
  [...block.children].forEach((row) => {
    const a = row.querySelector('a[href]');
    if (!a) return;
    const picture = row.querySelector('picture');
    const li = document.createElement('li');
    li.className = 'social-links-item';
    const link = document.createElement('a');
    link.className = 'social-links-link';
    link.href = a.getAttribute('href');
    if (a.target) link.target = a.target;
    const label = document.createElement('span');
    label.className = 'social-links-label';
    label.textContent = a.textContent.trim();
    link.append(label);
    if (picture) {
      picture.classList.add('social-links-icon');
      picture.querySelectorAll('img').forEach((img) => { img.alt = ''; });
      link.append(picture);
    } else {
      // a :icon: span authored next to the link
      const icon = row.querySelector('span.icon');
      if (icon) link.append(icon);
    }
    li.append(link);
    ul.append(li);
  });
  block.replaceChildren(ul);
}
