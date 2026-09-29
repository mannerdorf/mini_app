import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Account } from '../types';
import { usePersistedServiceMode } from './usePersistedServiceMode';
import { useDocumentsPageNavigation } from '../features/documents/hooks/useDocumentsPageNavigation';

let root: ReturnType<typeof create>;
let mode: ReturnType<typeof usePersistedServiceMode>;
let section: string;
const account = { login: 'staff', isRegisteredUser: true, permissions: { service_mode: true, doc_sendings: true, haulz: true } } as Account;
function Documents({ enabled, user }: { enabled: boolean; user: Account }) {
    section = useDocumentsPageNavigation({ permissions: user.permissions, showCustomerColumn: enabled, effectiveServiceMode: enabled, isDesktopLayout: true }).docSection;
    return null;
}
function App({ user = account }: { user?: Account }) {
    mode = usePersistedServiceMode(user);
    return React.createElement(Documents, { enabled: mode[0], user });
}
beforeEach(() => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
    const location = { href: 'https://example.test/?tab=documents&section=' + encodeURIComponent('Отправки') };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage, location, history: { replaceState: (_state: unknown, _title: string, url: string) => { location.href = url; } } });
});
afterEach(() => { act(() => root?.unmount()); vi.unstubAllGlobals(); });
it('restores service mode and Sendings on reload, and remembers turning the mode off', () => {
    localStorage.setItem('haulz.serviceMode:staff', '1');
    act(() => { root = create(React.createElement(App)); });
    expect(mode[0]).toBe(true);
    expect(section).toBe('Отправки');
    act(() => root.unmount());
    act(() => { root = create(React.createElement(App)); });
    expect(mode[0]).toBe(true);
    expect(section).toBe('Отправки');
    act(() => mode[1](value => !value));
    expect(localStorage.getItem('haulz.serviceMode:staff')).toBe('0');
    act(() => root.unmount());
    act(() => { root = create(React.createElement(App)); });
    expect(mode[0]).toBe(false);
});
it('isolates preferences between accounts and enforces current permissions', () => {
    act(() => { root = create(React.createElement(App)); });
    act(() => mode[1](true));
    act(() => root.update(React.createElement(App, { user: { ...account, login: 'other' } })));
    expect(mode[0]).toBe(false);
    act(() => root.update(React.createElement(App)));
    expect(mode[0]).toBe(true);
    act(() => root.update(React.createElement(App, { user: { ...account, permissions: { ...account.permissions, service_mode: false } } })));
    expect(mode[0]).toBe(false);
    act(() => mode[1](true));
    expect(mode[0]).toBe(false);
});
it('works without browser storage', () => {
    window.localStorage.getItem = () => { throw new Error('blocked'); };
    window.localStorage.setItem = () => { throw new Error('blocked'); };
    act(() => { root = create(React.createElement(App)); });
    act(() => mode[1](true));
    expect(mode[0]).toBe(true);
});
