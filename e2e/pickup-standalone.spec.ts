import {test,expect} from '@playwright/test';

for(const mode of ['driver','dispatcher'] as const) {
 test(`${mode} standalone opens without a missing navigation provider`,async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.text().includes('[ErrorBoundary]'))errors.push(message.text());});
  await page.route('**/api/**',route=>route.request().url().includes('/api/pickup')
   ?route.fulfill({json:{resources:[],jobs:[],routes:[],events:[],dispatcher:mode==='dispatcher',driverProfile:{city:'moscow'}}})
   :route.fulfill({status:503,json:{error:'Isolated test'}}));
  await page.addInitScript(({mode})=>{
   localStorage.setItem('haulz.accounts',JSON.stringify([{id:'pickup-test',login:'pickup-test',password:'fixture',isRegisteredUser:true,permissions:{[mode]:true},customers:[]}]));
   localStorage.setItem('haulz.activeAccountId','pickup-test');
   localStorage.setItem('haulz.selectedAccountIds','["pickup-test"]');
  },{mode});
  await page.goto('/');
  await expect(page.locator('.pk-root')).toBeVisible();
  await expect(page.getByText('Не удалось показать экран.',{exact:false})).toHaveCount(0);
  expect(errors).toEqual([]);
 });
}
