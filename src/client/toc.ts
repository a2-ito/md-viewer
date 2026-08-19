/** スティッキーヘッダの高さ + 余白。CSS の --header-h と揃える */
const HEADER_OFFSET = 56;

let observer: IntersectionObserver | null = null;

/**
 * 目次の現在位置をハイライトする。
 * scroll イベントを毎フレーム受けるのを避け、見出しの出入りを契機に再計算する。
 * 内容が差し替わったときは呼び直すことで再構築される。
 */
export const setupTocHighlight = (): void => {
  observer?.disconnect();
  observer = null;

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]'));
  if (links.length === 0) return;

  const linkBySlug = new Map<string, HTMLAnchorElement>();
  for (const link of links) {
    linkBySlug.set(decodeURIComponent(link.hash.slice(1)), link);
  }

  const headings = Array.from(
    document.querySelectorAll<HTMLElement>('.markdown-body h2[id], .markdown-body h3[id]'),
  ).filter((heading) => linkBySlug.has(heading.id));
  if (headings.length === 0) return;

  let currentSlug = '';

  const update = (): void => {
    // 文書順に見て、画面上端を最後に通過した見出しが現在位置
    let candidate = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > HEADER_OFFSET) break;
      candidate = heading;
    }

    const slug = candidate?.id ?? '';
    if (slug === currentSlug) return;
    linkBySlug.get(currentSlug)?.classList.remove('is-current');
    linkBySlug.get(slug)?.classList.add('is-current');
    currentSlug = slug;
  };

  observer = new IntersectionObserver(update, {
    rootMargin: `-${HEADER_OFFSET}px 0px 0px 0px`,
    threshold: [0, 1],
  });
  for (const heading of headings) observer.observe(heading);
  update();
};
