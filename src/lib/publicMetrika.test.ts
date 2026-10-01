import { describe, expect, it } from 'vitest';
import { publicAnalyticsUrl } from './publicMetrika';
describe('public analytics boundaries', () => {
  it('excludes admin, account and authentication URLs', () => {
    for (const path of ['/admin', '/cms', '/login', '/forgot', '/?tab=cargo', '/?profileView=haulz', '/?token=secret', '/missing']) {
      expect(publicAnalyticsUrl('https://haulz.space' + path)).toBeNull();
    }
  });
  it('keeps public direction and approved campaign labels without contact or form values', () => {
    expect(publicAnalyticsUrl('https://haulz.space/kalkulyator?direction=mow_kgd&utm_source=telegram&phone=123&address=private#secret')).toBe('https://haulz.space/kalkulyator?direction=mow_kgd&utm_source=telegram');
    expect(publicAnalyticsUrl('https://haulz.space/?utm_campaign=person@example.com')).toBe('https://haulz.space/');
  });
  it('does not collect on native, local or unconfigured domains', () => {
    for (const url of ['capacitor://localhost/', 'http://localhost/', 'https://haulz.pro/', 'https://api.haulz.space/']) expect(publicAnalyticsUrl(url)).toBeNull();
  });
  it('accepts public articles and canonicalizes trailing slashes', () => {
    expect(publicAnalyticsUrl('https://haulz.space/blog/packing/')).toBe('https://haulz.space/blog/packing');
  });
});

import { afterEach, vi } from 'vitest';
import { METRIKA_COUNTER_ID, stopPublicMetrika, trackPublicPage, trackGuestOrderSuccess } from './publicMetrika';
afterEach(() => { stopPublicMetrika(); vi.unstubAllGlobals(); });
describe('public counter lifecycle', () => {
  it('sends one hit per page, tracks SPA navigation, and stops before private pages', () => {
    const ym = vi.fn();
    vi.stubGlobal('window', { ym, location: { hash: '' } });
    vi.stubGlobal('navigator', { userAgent: 'test' });
    vi.stubGlobal('document', { referrer: 'https://search.example/?secret=hidden', getElementById: () => ({}) });
    trackPublicPage('https://haulz.space/', 'HAULZ');
    trackPublicPage('https://haulz.space/', 'HAULZ');
    trackPublicPage('https://haulz.space/faq', 'FAQ');
    expect(ym.mock.calls.filter(c => c[1] === 'init')).toHaveLength(1);
    expect(ym.mock.calls.filter(c => c[1] === 'hit')).toHaveLength(2);
    expect(ym.mock.calls[0][2]).toMatchObject({defer:true, webvisor:false, referrer:'https://search.example/'});
    trackPublicPage('https://haulz.space/login?token=hidden', 'Login');
    expect(ym).toHaveBeenLastCalledWith(METRIKA_COUNTER_ID, 'destruct');
    expect(JSON.stringify(ym.mock.calls)).not.toContain('hidden');
  });
});

describe('successful guest order goal', () => {
  function setup() {
    const ym = vi.fn();
    vi.stubGlobal('window', { ym, location: { hash: '', pathname: '/kalkulyator' } });
    vi.stubGlobal('navigator', { userAgent: 'test' });
    vi.stubGlobal('document', { referrer: '', getElementById: () => ({}) });
    return ym;
  }
  it('counts a confirmed order once without transmitting its identifier', () => {
    const ym = setup();
    trackPublicPage('https://haulz.space/kalkulyator', 'Calculator');
    trackGuestOrderSuccess('private-order-1');
    trackGuestOrderSuccess('private-order-1');
    expect(ym.mock.calls.filter(c => c[1] === 'reachGoal')).toEqual([[METRIKA_COUNTER_ID, 'reachGoal', 'guest_order_success']]);
    expect(JSON.stringify(ym.mock.calls)).not.toContain('private-order-1');
  });
  it('ignores results arriving after leaving the public calculator', () => {
    const ym = setup();
    trackGuestOrderSuccess('private-order-2');
    trackPublicPage('https://haulz.space/kalkulyator', 'Calculator');
    window.location.pathname = '/login';
    trackGuestOrderSuccess('private-order-2');
    stopPublicMetrika();
    window.location.pathname = '/kalkulyator';
    trackGuestOrderSuccess('private-order-2');
    expect(ym.mock.calls.filter(c => c[1] === 'reachGoal')).toHaveLength(0);
  });
  it('does not fail successful order handling when analytics throws', () => {
    const ym = setup();
    trackPublicPage('https://haulz.space/kalkulyator', 'Calculator');
    ym.mockImplementation(() => { throw new Error('analytics unavailable'); });
    expect(() => trackGuestOrderSuccess('private-order-3')).not.toThrow();
    ym.mockReset();
  });
});

it('tracks only the registered service URL and removes request details', () => {
  expect(publicAnalyticsUrl('https://haulz.space/uslugi/sbornye-gruzy?phone=private')).toBe('https://haulz.space/uslugi/sbornye-gruzy');
  expect(publicAnalyticsUrl('https://haulz.space/uslugi/private-customer')).toBeNull();
});
