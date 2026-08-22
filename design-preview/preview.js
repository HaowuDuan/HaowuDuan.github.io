const savedTheme = localStorage.getItem('theme');
const initialTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', initialTheme);

const siteNav = document.querySelector('.site-nav');
if (siteNav && !document.getElementById('theme-toggle')) {
  const themeButton = document.createElement('button');
  themeButton.id = 'theme-toggle';
  themeButton.className = 'theme-button';
  themeButton.type = 'button';
  themeButton.title = 'Toggle color theme';
  themeButton.setAttribute('aria-label', 'Toggle color theme');
  themeButton.textContent = '◐';
  siteNav.append(themeButton);
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem('theme', nextTheme);
});

const responsiveContents = document.querySelector('[data-responsive-details]');
const compactContents = window.matchMedia('(max-width: 1020px)');

function syncContentsMode() {
  if (!responsiveContents) return;
  responsiveContents.open = !compactContents.matches;
}

syncContentsMode();
compactContents.addEventListener('change', syncContentsMode);

const article = document.querySelector('[data-linked-headings]');
const headings = article ? [...article.querySelectorAll('h2[id], h3[id]')] : [];

for (const heading of headings) {
  const anchor = document.createElement('a');
  anchor.className = 'heading-anchor';
  anchor.href = `#${heading.id}`;
  anchor.setAttribute('aria-label', `Link to ${heading.textContent.trim()}`);
  anchor.textContent = '#';
  heading.append(anchor);
}

const tocLinks = [...document.querySelectorAll('[data-article-toc] a[href^="#"]')];
let scrollFrame = null;

function updateCurrentSection() {
  scrollFrame = null;
  if (!headings.length || !tocLinks.length) return;

  let current = headings[0];
  const threshold = window.innerHeight * 0.24;
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= threshold) current = heading;
    else break;
  }

  for (const link of tocLinks) {
    if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function scheduleCurrentSection() {
  if (scrollFrame === null) scrollFrame = requestAnimationFrame(updateCurrentSection);
}

updateCurrentSection();
addEventListener('scroll', scheduleCurrentSection, { passive: true });
addEventListener('resize', scheduleCurrentSection);
