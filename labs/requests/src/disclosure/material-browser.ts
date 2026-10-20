import { markdown } from '../../../../shared/markdown.ts';
import type { Material } from './contract.ts';

type Branch = { children: Map<string, Branch>; path?: string };

export function createMaterialBrowser(root: HTMLElement, paths: string[]) {
  root.innerHTML = '<div class="material-browser"><nav class="material-tree" aria-label="创作资料目录"></nav><article class="material-document"><p class="material-path"></p><div class="material-document-body"></div></article></div>';
  const tree = root.querySelector<HTMLElement>('.material-tree')!;
  const heading = root.querySelector<HTMLElement>('.material-path')!;
  const body = root.querySelector<HTMLElement>('.material-document-body')!;
  const files = new Map<string, HTMLButtonElement>();
  const branches: Branch = { children: new Map() };
  const collator = new Intl.Collator('zh-CN', { numeric: true });
  let controller: AbortController | undefined;

  for (const path of paths) {
    let branch = branches;
    for (const part of path.split('/')) {
      if (!branch.children.has(part)) branch.children.set(part, { children: new Map() });
      branch = branch.children.get(part)!;
    }
    branch.path = path;
  }

  function list(branch: Branch) {
    const ul = document.createElement('ul');
    const children = [...branch.children].sort(([a, x], [b, y]) => Number(Boolean(x.path)) - Number(Boolean(y.path)) || collator.compare(a, b));
    for (const [name, child] of children) {
      const li = document.createElement('li');
      if (child.path) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = name; button.title = child.path; button.setAttribute('aria-label', child.path);
        const path = child.path; files.set(path, button);
        button.addEventListener('click', () => void select(path)); li.append(button);
      } else {
        const folder = document.createElement('details'), label = document.createElement('summary');
        label.textContent = name; folder.append(label, list(child)); li.append(folder);
      }
      ul.append(li);
    }
    return ul;
  }
  tree.append(list(branches));

  async function select(path: string) {
    const button = files.get(path); if (!button) return;
    controller?.abort(); const pending = controller = new AbortController();
    for (const item of files.values()) item.removeAttribute('aria-current');
    button.setAttribute('aria-current', 'page');
    for (let parent = button.parentElement; parent && parent !== tree; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    heading.textContent = path;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '正在读取'; body.replaceChildren(status);
    try {
      const response = await fetch('/api/disclosure/materials?path=' + encodeURIComponent(path), { signal: pending.signal });
      if (!response.ok) throw new Error('资料无法读回，请重新选择文件。');
      const material = await response.json() as Material;
      // 快速切换文件时，只显示最后一次选择的返回。
      if (pending !== controller) return;
      body.replaceChildren(markdown(material.text)); body.scrollTop = 0;
    } catch (error) {
      if (!pending.signal.aborted) status.textContent = error instanceof Error ? error.message : '资料无法读回。';
    }
  }

  return { select, resolve: (href: string) => paths.find(path => path === href || encodeURI(path) === href) };
}
