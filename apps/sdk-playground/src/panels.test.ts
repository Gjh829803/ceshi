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

describe("React workbench and humanoid controls", () => {
  let browser: Browser, page: Page, script: string, css: string;
  beforeAll(async () => {
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
      import { createElement } from 'react';
      import { createRoot } from 'react-dom/client';
      import { Toaster } from 'sonner';
      const toastHost=document.createElement('div');document.body.append(toastHost);
      const toastRoot=createRoot(toastHost);toastRoot.render(createElement(Toaster,{duration:Infinity}));

      import { mountWorkbench } from './apps/sdk-playground/src/workbench.tsx';
      import { mountHumanoidLab } from './apps/sdk-playground/src/humanoid-panel.tsx';
      import { getDefaultProfile } from './packages/preset-content/src/profiles/profiles.ts';
      import { humanoid } from '@worldkit/three';
      let profile=getDefaultProfile('person'), auto=false, smoothing=true, debug='off';
      const events=[];
      const workbench=mountWorkbench(document.body, {
        onOpenChange:open=>events.push(['workbench',open]), onPrepare:(...args)=>events.push(['prepare',...args]),
        getMapId:()=> 'character-workshop', getAssetId:()=> 'person', getProfile:id=>structuredClone(id==='person'?profile:getDefaultProfile(id)),
        applyProfile:p=>{profile=p;events.push(['apply',p.control.speed]);}, saveProfile:p=>events.push(['save',p.control.speed]),
        resetProfile:id=>{profile=getDefaultProfile(id);events.push(['reset',id]);}, getState:()=>({marker:'runtime-state'}),
        togglePause:()=>events.push(['pause']),step:()=>events.push(['step'])
      });
      const lab=mountHumanoidLab(document.body, {
        onOpenChange:open=>events.push(['lab',open]),onPrepare:(...args)=>events.push(['trial',...args]),onAction:action=>events.push(['action',action]),
        getState:()=>({marker:'actor-state'}),getKeyBindings:()=>humanoid.DEFAULT_KEY_BINDINGS,
        getAutoTraverse:()=>auto,setAutoTraverse:v=>auto=v,getSmoothing:()=>smoothing,setSmoothing:v=>smoothing=v,getDebug:()=>debug,setDebug:v=>debug=v
      });
      for(const [name,action] of [['Workbench',()=>workbench.open('camera')],['Lab',()=>lab.open()]]){
        const button=document.createElement('button');button.textContent=name;button.onclick=action;document.body.append(button);
      }
      window.panelTest={openLab:()=>lab.open(),closeWorkbench:()=>workbench.close(),closeLab:()=>lab.close(),state:()=>({events,auto,smoothing,debug,profile}),dispose:()=>{workbench.dispose();lab.dispose();}};
    `,
      },
      nodePaths: [`${process.cwd()}/apps/sdk-playground/node_modules`],
      bundle: true,
      jsx: "automatic",
      write: false,
      outdir: "panels-test",
      format: "iife",
      platform: "browser",
      logLevel: "silent",
    });
    script = bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
    css = bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text;
    browser = await launchChromiumWithSystemFallback();
  }, 60000);
  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(4000);
    await page.setContent(
      "<style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}[data-slot=dialog-overlay]{position:fixed;inset:0;z-index:50;background:#0008}[data-slot=dialog-content]{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style>",
    );
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });
  });
  afterEach(async () => {
    await page?.evaluate(() => (window as any).panelTest?.dispose());
    await page?.close();
  });
  afterAll(async () => {
    await browser?.close();
  });
  const state = () => page.evaluate(() => (window as any).panelTest.state());
  it("applies, validates, saves and resets movement edits and exposes explicit stepping", async () => {
    await page.getByRole("button", { name: "Workbench", exact: true }).click();
    const distance = page.getByRole("spinbutton", { name: /基础移速基准/ });
    await distance.fill("5");
    await distance.blur();
    expect((await state()).profile.control.speed).toBe(5);
    await page.getByRole("button", { name: "保存这个资产的配置" }).click();
    expect((await state()).events).toContainEqual(["save", 5]);
    await distance.fill("999");
    await distance.blur();
    expect(await distance.inputValue()).toBe("5");
    expect(await page.locator("[data-sonner-toast][data-type=error]").isVisible()).toBe(true);
    await page.getByRole("button", { name: "恢复资产默认值" }).click();
    expect((await state()).events).toContainEqual(["reset", "person"]);
    await page
      .getByRole("button", { name: "暂停 / 继续", exact: true })
      .click();
    await page.getByRole("button", { name: "单步 1/60 秒" }).click();
    expect((await state()).events.slice(-2)).toEqual([["pause"], ["step"]]);
    await page.getByRole("button", { name: "关闭" }).click();
    await expect
      .poll(() =>
        page
          .getByRole("button", { name: "Workbench", exact: true })
          .evaluate((n) => n === document.activeElement),
      )
      .toBe(true);
  });
  it("refreshes toggle state, searches trials and dispatches actions after modal input reset", async () => {
    await page.getByRole("button", { name: "Lab", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "自动翻越 / 攀上（调试，默认关闭）" })
      .click();
    expect((await state()).auto).toBe(true);
    await page
      .getByRole("searchbox", { name: "搜索人物测试点" })
      .fill("no matching trial anywhere");
    expect(await page.getByText("没有匹配的测试点。").isVisible()).toBe(true);
    await page.getByRole("button", { name: /普通跳跃（原地）/ }).click();
    await expect
      .poll(async () => (await state()).events.slice(-2))
      .toEqual([
        ["lab", false],
        ["action", "jump"],
      ]);
    await page.getByRole("button", { name: "Lab", exact: true }).click();
    expect(
      await page
        .getByRole("checkbox", { name: "自动翻越 / 攀上（调试，默认关闭）" })
        .isChecked(),
    ).toBe(true);
    await page.getByRole("button", { name: "关闭" }).click();
    await expect
      .poll(() =>
        page
          .getByRole("button", { name: "Lab", exact: true })
          .evaluate((n) => n === document.activeElement),
      )
      .toBe(true);
  });
  it("uses custom menus inside the dialog and Escape closes only the menu", async () => {
    await page.getByRole("button", { name: "Lab", exact: true }).click();
    const trigger = page.getByRole("combobox", {
      name: "碰撞体显示",
      exact: true,
    });
    await trigger.click();
    expect(
      await page
        .getByRole("listbox")
        .evaluate((node) => !!node.closest('[role="dialog"][data-state="open"]')),
    ).toBe(true);
    await page.getByRole("option", { name: "全部", exact: true }).click();
    await expect.poll(async () => (await state()).debug).toBe("all");
    expect(await trigger.textContent()).toContain("全部");
    await trigger.click();
    await page.keyboard.press("Escape");
    expect(await page.getByRole("listbox").count()).toBe(0);
    expect(await page.getByRole("dialog").count()).toBe(1);
    await expect
      .poll(() => trigger.evaluate((node) => node === document.activeElement))
      .toBe(true);
    expect(await page.locator("select:visible").count()).toBe(0);
  });
  it("supports keyboard selection of the test map", async () => {
    await page.getByRole("button", { name: "Lab", exact: true }).click();
    const trigger = page.getByRole("combobox", { name: "人物测试地图" });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("listbox").waitFor();
    await page.keyboard.press("Home");
    await expect
      .poll(() =>
        page
          .getByRole("option", { name: "VECTOR 综合训练园区", exact: true })
          .evaluate((node) => node === document.activeElement),
      )
      .toBe(true);
    await page.keyboard.press("Enter");
    expect(await page.getByRole("listbox").count()).toBe(0);
    expect(await trigger.textContent()).toContain("VECTOR 综合训练园区");
  });
  it.each([
    ["Workbench", "workbench"],
    ["Lab", "lab"],
  ])(
    "releases %s modal pause when disposed while open",
    async (button, event) => {
      await page.getByRole("button", { name: button, exact: true }).click();
      await page.evaluate(() => (window as any).panelTest.dispose());
      expect((await state()).events.slice(-2)).toEqual([
        [event, true],
        [event, false],
      ]);
      expect(await page.getByRole("dialog").count()).toBe(0);
    },
  );
  it.each([['Workbench', 'workbench'], ['Lab', 'lab']])('dismisses %s with Escape and outside click and restores focus', async (button, event) => {
    const trigger = page.getByRole('button', { name: button, exact: true });
    await trigger.click(); await page.keyboard.press('Escape');
    await expect.poll(() => trigger.evaluate(node => node === document.activeElement)).toBe(true);
    await trigger.click(); await page.mouse.click(5, 5);
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
    await expect.poll(() => trigger.evaluate(node => node === document.activeElement)).toBe(true);
    expect((await state()).events.slice(-4)).toEqual([[event, true], [event, false], [event, true], [event, false]]);
  });

  it('does not retain an action across an immediate close and reopen', async () => {
    await page.getByRole('button', {name:'Lab',exact:true}).click();
    await page.evaluate(() => {
      const action = [...document.querySelectorAll<HTMLButtonElement>('.wb-actions button')].find(node => node.textContent?.includes('普通跳跃（原地）'))!;
      action.click(); (window as any).panelTest.openLab();
    });
    expect(await page.getByRole('dialog', {name:'人物动作'}).isVisible()).toBe(true);
    await page.getByRole('button', {name:'关闭',exact:true}).click();
    expect((await state()).events.filter((entry: unknown[]) => entry[0] === 'action')).toEqual([]);
  });

});
