import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('@maxhub/max-ui',()=>({
  Button:(props:any)=>React.createElement('button',props),Flex:(props:any)=>React.createElement('div',props),Panel:(props:any)=>React.createElement('section',props),
  Typography:{Headline:(props:any)=>React.createElement('h1',props)},
}));
vi.mock('../../api/client/twoFa',()=>({fetchTwoFaSettings:vi.fn(),twoFaRequest:vi.fn()}));
vi.mock('qrcode',()=>({toDataURL:vi.fn(async()=> 'data:image/png;base64,local')}));
import {fetchTwoFaSettings,twoFaRequest} from '../../api/client/twoFa';
import {ProfileTwoFactorSection} from './ProfileTwoFactorSection';
let root:ReactTestRenderer|undefined;
const off={enabled:false,method:'google' as const,telegramLinked:false,googleSecretSet:false};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(fetchTwoFaSettings).mockResolvedValue({settings:off});});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;});
function button(label:string){return root!.root.findAllByType('button').find(node=>node.children.join('').includes(label))!;}
it('updates the account only after confirmation, keeps active state on failure, and generates QR locally',async()=>{
  const update=vi.fn();
  await act(async()=>{root=create(React.createElement(ProfileTwoFactorSection,{activeAccount:{id:'a',login:'alice',password:'existing-password'},activeAccountId:'a',onBack:vi.fn(),onUpdateAccount:update}));});
  expect(twoFaRequest).not.toHaveBeenCalled();
  vi.mocked(twoFaRequest).mockResolvedValueOnce({token:'grant',expiresIn:300,settings:off});
  act(()=>root!.root.findByProps({type:'password'}).props.onChange({target:{value:'confirmed-password'}}));
  await act(async()=>{root!.root.findByType('form').props.onSubmit({preventDefault(){}});});
  expect(twoFaRequest).toHaveBeenLastCalledWith('2fa',{action:'authorize',login:'alice',password:'confirmed-password',code:''});
  vi.mocked(twoFaRequest).mockResolvedValueOnce({secret:'temporary-secret',otpauthUrl:'otpauth://local-only'});
  await act(async()=>{button('Настроить Google').props.onClick();await vi.dynamicImportSettled();});
  expect(root!.root.findByType('img').props.src).toBe('data:image/png;base64,local');
  expect(update.mock.lastCall?.[1].twoFactorEnabled).toBe(false);
  act(()=>root!.root.findByProps({inputMode:'numeric'}).props.onChange({target:{value:'123456'}}));
  vi.mocked(twoFaRequest).mockRejectedValueOnce(new Error('Неверный код'));
  await act(async()=>{button('Проверить код и включить').props.onClick();});
  expect(root!.root.findByProps({role:'alert'}).children.join('')).toBe('Неверный код');
  expect(update.mock.lastCall?.[1].twoFactorEnabled).toBe(false);
  vi.mocked(twoFaRequest).mockResolvedValueOnce({settings:{...off,enabled:true,googleSecretSet:true}});
  await act(async()=>{button('Проверить код и включить').props.onClick();});
  expect(update.mock.lastCall?.[1]).toMatchObject({twoFactorEnabled:true,twoFactorGoogleSecretSet:true});
  expect(root!.root.findAllByType('img')).toHaveLength(0);
  expect(root!.root.findByProps({type:'password'}).props.value).toBe('');
});
it('does not display disabled MFA when the settings request fails',async()=>{
  vi.mocked(fetchTwoFaSettings).mockRejectedValueOnce(new Error('Хранилище недоступно'));
  const update=vi.fn();await act(async()=>{root=create(React.createElement(ProfileTwoFactorSection,{activeAccount:{id:'a',login:'alice',password:'password'},activeAccountId:'a',onBack:vi.fn(),onUpdateAccount:update}));});
  expect(update).not.toHaveBeenCalled();
  expect(root!.root.findByProps({role:'alert'}).children.join('')).toBe('Хранилище недоступно');
  expect(JSON.stringify(root!.toJSON())).not.toContain('Второй фактор выключен');
});
