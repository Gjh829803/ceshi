import { humanoid } from '@worldkit/three';
import { SPECS } from '@worldkit/preset-content/config';
import { buildWorkspaceCatalog, filterAssets, sanitizeAssetIds } from '@worldkit/preset-content/platform/catalog';
import { DRAGON_VARIANTS } from '@worldkit/preset-content/dragon-variants';
import { build } from "esbuild";
import type { Browser, Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { launchChromiumWithSystemFallback } from "@worldkit/browser-capture/browser";

describe("React asset library browser contracts", () => {
  let browser: Browser, page: Page, script: string, css: string;
  beforeAll(async () => {
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
   import {toast} from './apps/sdk-playground/node_modules/sonner/dist/index.mjs';
      import { mountAssetLibrary } from './apps/sdk-playground/src/library.tsx';
      const assets = Array.from({length:9}, (_,i) => ({id:'asset-'+i,name:'资产'+i,en:'ASSET '+i,mode:'wheeled',kernel:'fixture',color:'#aabbcc',icon:'car',environment:i===2?'air':'ground',tags:['fixture'],kind:i===0?'character':'vehicle',status:i===8?'draft':'local',contributor:'测试贡献者'}));
      const selected=[],browsed=[],events=[],slots=[];
      let library;
      window.libraryTest={toasts:()=>toast.getHistory().map(item=>item.title),
        mount(){library=mountAssetLibrary(document.querySelector('#host'),{assets,onSelect:id=>selected.push(id),onBrowseChange:asset=>browsed.push(asset.id),onOpenChange:open=>events.push(open),onQuickSlotsChange:assets=>slots.push(assets.map(asset=>asset.id))});},
        open:()=>library.open(),close:()=>library.close(),active:id=>library.setActive(id),thumbnail:(id,url)=>library.setThumbnail(id,url),dispose:()=>library.dispose(),
        state:()=>({selected,browsed,events,slots,open:library.isOpen(),quick:library.getQuickSlots().map(asset=>asset.id)})
      };
      window.libraryTest.mount();
      document.querySelector('#open').onclick=()=>library.open();
      window.keyEvents=[];
      document.addEventListener('keydown',e=>window.keyEvents.push('down:'+e.key));
      document.addEventListener('keyup',e=>window.keyEvents.push('up:'+e.key));
    `,
      },
      bundle: true,
      write: false,
      outdir: "library-test",
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      logLevel: "silent",
      define: { "process.env.NODE_ENV": '"development"' },
      loader: {
        ".woff2": "dataurl",
        ".woff": "dataurl",
        ".ttf": "dataurl",
        ".svg": "dataurl",
      },
    });
    script = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
    css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
    browser = await launchChromiumWithSystemFallback();
  }, 60000);
  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(3000);
    // A real origin gives this fixture native localStorage behavior.
    await page.route("http://library.test/", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<button id="open">打开资产库</button><div id="host"></div>',
      }),
    );
    await page.goto("http://library.test/");
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });
  });
  afterEach(async () => {
    await page?.close();
  });
  afterAll(async () => {
    await browser?.close();
  });
  const state = () => page.evaluate(() => (window as any).libraryTest.state());
  const open = () =>
    page.getByRole("button", { name: "打开资产库", exact: true }).click();
  const browse = (index: number) =>
    page.getByRole("button", { name: `查看资产${index}`, exact: true });
  const favorite = (index: number) =>
    page.getByRole("button", { name: `收藏资产${index}`, exact: true });

  it("keeps browsing separate from activation and restores keyboard focus on close", async () => {
    await open();
    expect(
      await page
        .getByRole("searchbox")
        .evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await browse(3).click();
    expect((await state()).selected).toEqual([]);
    expect((await state()).browsed).toEqual(["asset-3"]);
    expect(
      await browse(3).evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await page.getByRole("button", { name: "前往资产" }).click();
    expect((await state()).selected).toEqual(["asset-3"]);
    expect((await state()).events).toEqual([true, false]);
    expect(
      await page
        .locator("#open")
        .evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await open();
    await browse(8).click();
    expect(
      await page.getByRole("button", { name: "前往资产" }).isDisabled(),
    ).toBe(true);
    await page.keyboard.press("Escape");
    expect((await state()).open).toBe(false);
    expect(await page.evaluate(() => (window as any).keyEvents)).toContain(
      "up:Escape",
    );
    expect(await page.evaluate(() => (window as any).keyEvents)).not.toContain(
      "down:Escape",
    );
  });

  it("focuses the library after its host becomes visible and keeps Escape out of gameplay", async () => {
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('#host')!;
      host.hidden = true;
      document.querySelector<HTMLElement>('#open')!.onclick = () => {
        (window as any).libraryTest.open();
        host.hidden = false;
      };
    });
    await open();
    expect(await page.getByRole('searchbox').evaluate(node => node === document.activeElement)).toBe(true);
    await page.keyboard.press('Escape');
    expect((await state()).open).toBe(false);
    expect(await page.evaluate(() => (window as any).keyEvents)).not.toContain('down:Escape');
    expect(await page.locator('#open').evaluate(node => node === document.activeElement)).toBe(true);
  });

  it("filters metadata and categories, sorts recent assets, and preserves selection", async () => {
    await open();
    await browse(3).click();
    await page.getByRole("searchbox").fill("测试贡献者 资产2");
    expect(await page.locator(".asset-library-card").count()).toBe(1);
    expect(
      await page.locator(".asset-library-detail-title").textContent(),
    ).toBe("资产3");
    await page.getByRole("searchbox").fill("");
    await page.getByRole("button", { name: "人物", exact: true }).click();
    expect(
      await page.locator(".asset-library-card").getAttribute("data-asset-id"),
    ).toBe("asset-0");
    await page.getByRole("button", { name: "空域", exact: true }).click();
    expect(
      await page.locator(".asset-library-card").getAttribute("data-asset-id"),
    ).toBe("asset-2");
    await page.getByRole("button", { name: "全部", exact: true }).click();
    await page.evaluate(() => (window as any).libraryTest.active("asset-7"));
    await page.getByRole("combobox", { name: "资产排序" }).click();
    await page.getByRole("option", { name: "最近使用", exact: true }).click();
    expect(
      await page
        .locator(".asset-library-card")
        .first()
        .getAttribute("data-asset-id"),
    ).toBe("asset-7");
    expect((await state()).selected).toEqual([]);
    expect(
      await page
        .locator('.asset-library-card[data-active="true"]')
        .getAttribute("data-asset-id"),
    ).toBe("asset-7");
  });

  it("persists unlimited favorites with six quick slots and keeps removal focus reachable", async () => {
    await open();
    for (let i = 0; i < 8; i++) await favorite(i).click();
    expect(
      await page.locator(".asset-library-favorite-count").textContent(),
    ).toBe("8 项收藏");
    expect((await state()).quick).toEqual(
      Array.from({ length: 6 }, (_, i) => `asset-${i}`),
    );
    await page.evaluate(() => {
      (window as any).libraryTest.dispose();
      (window as any).libraryTest.mount();
      (window as any).libraryTest.open();
    });
    expect(
      await page.locator(".asset-library-favorite-count").textContent(),
    ).toBe("8 项收藏");
    await page.getByRole("button", { name: "仅看收藏" }).click();
    await page
      .getByRole("button", { name: "取消收藏资产0", exact: true })
      .click();
    expect(await page.locator(".asset-library-card").count()).toBe(7);
    expect(
      await page
        .getByRole("button", { name: "仅看收藏" })
        .evaluate((node) => node === document.activeElement),
    ).toBe(true);
  });

  it("falls back after storage failures and sanitizes restored preferences", async () => {
    await page.evaluate(() => {
      (window as any).libraryTest.dispose();
      localStorage.setItem(
        "vector.asset-library.v1",
        JSON.stringify({
          version: 1,
          favorites: ["asset-3", "unknown", "asset-3", null],
          recent: ["asset-7", 12],
        }),
      );
      (window as any).libraryTest.mount();
      (window as any).libraryTest.open();
    });
    expect(
      await page.locator(".asset-library-favorite-count").textContent(),
    ).toBe("1 项收藏");
    expect((await state()).quick.slice(0, 2)).toEqual(["asset-3", "asset-7"]);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("quota");
      };
    });
    await favorite(4).click();
    expect(
      await page.locator(".asset-library-preference-status").textContent(),
    ).toBe("仅本次会话保存");
    expect(
      await page.evaluate(() => (window as any).libraryTest.toasts()),
    ).toContain("浏览器存储不可用，收藏和最近使用仅保留在本次会话。");
    expect((await state()).quick.slice(0, 3)).toEqual([
      "asset-3",
      "asset-4",
      "asset-7",
    ]);
  });

  it("renders thumbnail updates, handles image errors, and disposes idempotently", async () => {
    await open();
    const dataUrl =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="red" d="M0 0h1v1H0z"/></svg>',
      );
    await page.evaluate(
      (url) => (window as any).libraryTest.thumbnail("asset-0", url),
      dataUrl,
    );
    expect(
      await page.locator('[data-asset-thumbnail="asset-0"] img').count(),
    ).toBe(2);
    await page.evaluate(() =>
      (window as any).libraryTest.thumbnail(
        "asset-0",
        "data:image/png;base64,broken",
      ),
    );
    await expect
      .poll(() => page.locator('[data-asset-thumbnail="asset-0"] img').count())
      .toBe(0);
    expect(
      await page.locator('[data-asset-thumbnail="asset-0"] svg.lucide').count(),
    ).toBe(2);
    await page.evaluate(() => {
      (window as any).libraryTest.dispose();
      (window as any).libraryTest.dispose();
      (window as any).libraryTest.open();
    });
    expect(await page.locator(".asset-library").count()).toBe(0);
    expect((await state()).events).toEqual([true, false]);
  });
  it("replaces native title hints with accessible tooltips without changing the docked pane", async () => {
    await page.evaluate(() => (window as any).libraryTest.open());
    expect(await page.locator(".asset-library [title]").count()).toBe(0);
    await page.getByRole("button", { name: "收起资产库", exact: true }).hover();
    await expect
      .poll(() => page.getByRole("tooltip").textContent())
      .toBe("收起资产库 · Esc");
    expect(await page.locator(".asset-library").getAttribute("role")).not.toBe(
      "dialog",
    );
  });
});


describe('numbered dragon library entries', () => {
  it('lists all available dragon models under creatures with distinct selectable identities', () => {
    const specs=SPECS.map(spec=>spec.id==='dragon'?humanoid.createFlyingCreatureSpec('dragon'):spec);
    const catalog=buildWorkspaceCatalog(specs);
    const dragons=filterAssets(catalog,'','creatures').filter(asset=>asset.dragonVariantId);
    expect(dragons.map(asset=>asset.dragonVariantId)).toEqual(DRAGON_VARIANTS.map(variant=>variant.id));
    expect(dragons).toHaveLength(11);
    expect(new Set(catalog.map(asset=>asset.id)).size).toBe(catalog.length);
    expect(dragons.find(asset=>asset.dragonVariantId==='D01')?.id).toBe('dragon');
    expect(sanitizeAssetIds(catalog,['dragon','creature.dragon.d11','LP01','B01'])).toEqual(['dragon','creature.dragon.d11']);
    expect(filterAssets(catalog,'D11','creatures').map(asset=>asset.dragonVariantId)).toEqual(['D11']);
    expect(filterAssets(catalog,'D02','air').map(asset=>asset.dragonVariantId)).toEqual(['D02']);
  });
});
