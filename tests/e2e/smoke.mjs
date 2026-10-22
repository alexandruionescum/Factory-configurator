// Browser smoke test of the built app (app/dist/index.html): every step, the brief import, all shapes,
// exports, theme switch and phone width. Fails on any page error.
// Run: cd app && npm run build; cd ../tests/e2e && npm install && npm run smoke
// In a Claude cloud session set CHROMIUM=/opt/pw-browsers/chromium (no browser download needed).
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../../app/package.json', import.meta.url));
const ExcelJS = require('exceljs');
const app = new URL('../../app/dist/index.html', import.meta.url).href;
const out = mkdtempSync(join(tmpdir(), 'fc-smoke-'));
const ok = (cond, msg) => { if (!cond) throw new Error(`FAILED: ${msg}`); console.log(`ok  ${msg}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
const step = n => page.click(`nav.steps button:nth-child(${n})`);
const save = async (click, name) => {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), click()]);
  await d.saveAs(join(out, name)); return d.suggestedFilename();
};

await page.goto(app);
ok((await page.$$eval('nav.steps button b', b => b.map(x => x.textContent))).join() === 'Factory size,Zones,Layout,Flows,3D,Export', 'six steps');

// brief: download the template from the site, fill it, import it, generate the layout
const tpl = await save(() => page.click('text=Download brief template'), 'template.xlsx');
ok(tpl.endsWith('.xlsx'), `template downloaded (${tpl})`);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(join(out, 'template.xlsx'));
wb.getWorksheet('Project').eachRow(r => { if (r.getCell(1).value === 'Project name') r.getCell(2).value = 'Smoke test plant'; });
const areas = [['A-01', 'Line', 'Assembly', 'Assembly', 400], ['A-02', 'Line', 'Test', 'Production', 150], ['S-01', 'Support', 'Warehouse', 'Storage', 500], ['S-02', 'Support', 'Offices', 'Administration', 120]];
areas.forEach((a, i) => { const r = wb.getWorksheet('Areas').getRow(5 + i); [a[0], a[1], a[2], a[3], , a[4]].forEach((v, k) => { if (v !== undefined) r.getCell(k + 1).value = v; }); });
['Product A', 10000, 20, 'S-01 > A-01 > A-02'].forEach((v, k) => { wb.getWorksheet('Flows').getRow(5).getCell(k + 1).value = v; });
await wb.xlsx.writeFile(join(out, 'filled.xlsx'));
await page.setInputFiles('.brief .file-btn input', join(out, 'filled.xlsx'));
await page.waitForSelector('.brief .import');
ok((await page.locator('.brief .stats').innerText()).includes('4'), 'brief read: 4 areas');
await page.click('.brief button.primary:has-text("Generate layout")');
await page.click('.modal button.primary');
ok(await page.locator('svg.plan rect[fill-opacity]').count() === 4, 'layout generated with 4 zones');

// shapes: each shape, rotation, fit size -> no errors in the checks
for (const s of ['L', 'U', 'S', 'I']) {
  await page.click(`.seg.shapes button:has-text("${s}")`);
  await page.click('button.rot');
  await page.click('text=Fit factory size to shape');
  ok((await page.locator('.side .issues li.error').count()) === 0, `${s} shape rotated and fitted: no errors`);
}
await page.selectOption('.shape-card select', 'type');
ok((await page.locator('.legend span').count()) >= 3, 'legend shows the area types');

await step(4); ok(await page.locator('.card.product').count() === 1, 'flows step shows the imported family');
await step(5); await page.waitForTimeout(1200); ok(await page.locator('.view3d canvas').count() === 1, '3D view renders');
await step(6);
ok((await save(() => page.click('text=Download PowerPoint'), 'deck.pptx')).endsWith('.pptx'), 'PowerPoint exported');
ok((await save(() => page.click('text=Download image'), 'plan.png')).endsWith('.png'), 'image exported');
ok((await save(() => page.click('.top >> text=Save'), 'project.json')).endsWith('.json'), 'project saved');

await page.click('button[aria-label="Dark mode"]');
ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark theme');
await page.setViewportSize({ width: 390, height: 844 });
await step(3);
ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'no horizontal scroll at phone width');

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(`files in ${out}`);
