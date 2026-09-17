import { useEffect, useRef, useState } from 'react';
import { cacheRead, cacheWrite } from './client';
import type { Pending } from './outbox';

export function usePickupOutbox(key: string, onError: (message: string) => void) {
  const owner = useRef(key); owner.current = key;
  const error = useRef(onError); error.current = onError;
  const [state, setState] = useState<{key:string;items:Pending[];ready:boolean}>({key,items:[],ready:false});
  useEffect(() => {
    let active = true;
    void cacheRead<Pending[]>(key).then(items => {
      if (active) setState({key,items:items || [],ready:true});
    }).catch(() => {
      if (active) error.current('Локальное хранилище недоступно. Сохранённые отметки не загружены. Перезапустите приложение после восстановления хранилища.');
    });
    return () => { active = false; };
  }, [key]);
  const save = async (items: Pending[]) => {
    await cacheWrite(key,items);
    if (owner.current === key) setState({key,items,ready:true});
  };
  return { items: state.key === key ? state.items : [], ready: state.key === key && state.ready, save };
}
