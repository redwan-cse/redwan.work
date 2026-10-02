import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve, dirname} from 'node:path';
import {runInThisContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Render the actual shell and installed Radix primitives. Only framework routing
// is substituted; no sessions, backend fixtures, browser, or network is involved.
const root = resolve('.');
function render(pathname, rootHref = '/admin', extra = []) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports: {}};
    cache.set(file, module);
    const nativeRequire = createRequire(file);
    function require(specifier) {
      if (specifier === 'next/navigation') return {usePathname: () => pathname};
      if (specifier === 'next/link') return {__esModule: true, default: React.forwardRef(function FixtureLink({href, children, ...props}, ref) {
        return React.createElement('a', {...props, href, ref}, children);
      })};
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const target = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(file), specifier);
        return load(nativeRequire.resolve(target));
      }
      return nativeRequire(specifier);
    }
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, fileName: file}).outputText;
    runInThisContext('(function(require,module,exports){' + source + '\n})', {filename: file})(require, module, module.exports);
    return module.exports;
  }
  const {PanelShell} = load(resolve(root, 'components/panel/panel-shell.tsx'));
  const navItems = [
    {label: 'Overview', href: rootHref},
    {label: 'Projects', href: rootHref + '/projects'},
    {label: 'Invoices', href: rootHref + '/invoices'},
    {label: 'Unavailable', href: rootHref + '/disabled', enabled: false},
    ...extra,
  ];
  return renderToStaticMarkup(React.createElement(PanelShell, {
    title: 'Synthetic workspace', userEmail: 'fixture@example.test', navItems,
    activeHref: rootHref,
  }, React.createElement('h1', null, 'Synthetic page')));
}
function selected(html) {
  return [...html.matchAll(/<a\b[^>]*>/g)]
    .filter(([tag]) => tag.includes('aria-current="page"'))
    .map(([tag]) => tag.match(/href="([^"]+)"/)[1]);
}
for (const rootHref of ['/admin', '/portal']) {
  test('portal navigation selects the real nested route, not the supplied root: ' + rootHref, () => {
    assert.deepEqual(selected(render(rootHref + '/projects/fixture/invoices', rootHref)), [rootHref + '/projects']);
  });
  test('portal root selection is exact and handles a trailing slash: ' + rootHref, () => {
    assert.deepEqual(selected(render(rootHref, rootHref)), [rootHref]);
    assert.deepEqual(selected(render(rootHref + '/', rootHref)), [rootHref]);
    assert.deepEqual(selected(render(rootHref + '/projects/', rootHref)), [rootHref + '/projects']);
  });
  test('portal selection respects segment boundaries, disabled routes and missing pathname: ' + rootHref, () => {
    for (const path of [rootHref + '/projects-old', rootHref + 'ish', rootHref + '/disabled', null]) {
      assert.deepEqual(selected(render(path, rootHref)), []);
    }
  });
}
test('only the most specific enabled matching navigation item is current', () => {
  assert.deepEqual(selected(render('/admin/projects/active/fixture', '/admin', [
    {label: 'Active projects', href: '/admin/projects/active'},
  ])), ['/admin/projects/active']);
});
test('navigation retains link destinations and POST logout without making disabled items clickable', () => {
  const html = render('/admin/projects');
  for (const href of ['/admin', '/admin/projects', '/admin/invoices']) assert.ok(html.includes('href="' + href + '"'));
  assert.ok(!html.includes('href="/admin/disabled"'));
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /<form[^>]*action="\/api\/auth\/logout"[^>]*method="post"/);
});
test('shell offers a named mobile navigation trigger and a content focus target', () => {
  const html = render('/admin/projects');
  assert.match(html, /aria-label="Open workspace navigation"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /id="portal-content"/);
  assert.match(html, /href="#portal-content"/);
});
