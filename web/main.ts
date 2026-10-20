import { groups } from '../shared/catalog.ts';
import './style.css';

document.querySelector('#experiments')!.innerHTML = groups.map(group => `<section><h2>${group.title}</h2><ul>${group.items.map(([path, title]) => `<li><a href="${path}">${title}</a></li>`).join('')}</ul></section>`).join('');
