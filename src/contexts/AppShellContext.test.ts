import React from 'react';import{act,create}from'react-test-renderer';import{afterEach,expect,it,vi}from'vitest';
vi.mock('../webApp',()=>({getWebApp:()=>null}));vi.mock('../wb/appWb',()=>({syncAppUrlWithActiveTab:()=>{},wildberriesInitialTabFromUrl:()=>null,TABS_ALLOWED_ON_RESTORE:[]}));
import{AppShellProvider,useAppShell}from'./AppShellContext';
afterEach(()=>vi.unstubAllGlobals());
it('forces light for a screen without erasing the saved dark preference',async()=>{
 const saved=new Map([['haulz.theme','dark']]);vi.stubGlobal('window',{location:{href:'https://example.invalid/'},localStorage:{getItem:(k:string)=>saved.get(k),setItem:(k:string,v:string)=>saved.set(k,v)}});
 const classList={remove:vi.fn(),add:vi.fn()};vi.stubGlobal('document',{documentElement:{classList},body:{classList},querySelector:()=>null});
 let shell:ReturnType<typeof useAppShell>;function Child(){shell=useAppShell();return null;}let root:any;
 await act(async()=>{root=create(React.createElement(AppShellProvider,{children:React.createElement(Child)}));});
 expect(shell!.theme).toBe('dark');await act(async()=>shell!.setThemeOverride('light'));expect(shell!.theme).toBe('light');expect(saved.get('haulz.theme')).toBe('dark');
 await act(async()=>shell!.setThemeOverride(null));expect(shell!.theme).toBe('dark');await act(async()=>shell!.setTheme('light'));expect(saved.get('haulz.theme')).toBe('light');act(()=>root.unmount());
});
