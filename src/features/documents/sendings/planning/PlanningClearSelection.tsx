import React from 'react';
import {ListX} from 'lucide-react';

export function PlanningClearSelection({disabled,onClear}:{disabled:boolean;onClear:()=>void}) {
 return <button type="button" className="sending-planning__icon sending-planning__clear-selection" aria-label="Очистить выбранные перевозки" title="Очистить выбранные перевозки; уже отправленные сохранятся" disabled={disabled} onClick={onClear}><ListX size={19}/></button>;
}
