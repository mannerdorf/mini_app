import React from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { CalendarClock, Loader2 } from "lucide-react";
import { type EorStatus } from "./sendingsTypes";
import type {DocumentsAuth} from '../../../api/client/documentsAuth';
import {SendingsPlanningButton} from './planning/SendingsPlanningButton';
import {FilterDropdownPortal} from '../../../components/ui/FilterDropdownPortal';

type Props = {
  planningAuth?: DocumentsAuth | null;
  selectedCount: number;
  canEditEor: boolean;
  canEditPlanDate: boolean;
  canRunSanctionsCheck: boolean;
  actionLoading: boolean;
  eorMenuOpen: boolean;
  setEorMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  planDateOpen: boolean;
  setPlanDateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  planDateValue: string;
  setPlanDateValue: React.Dispatch<React.SetStateAction<string>>;
  actionError: string | null;
  actionInfo: string | null;
  onApplyEorStatus: (status: EorStatus) => void;
  onApplyPlanDate: () => void;
  onApplySanctionsCheck: () => void;
};

export function SendingsBulkActionsBar({planningAuth,selectedCount,canEditPlanDate,actionLoading,setEorMenuOpen,planDateOpen,setPlanDateOpen,planDateValue,setPlanDateValue,actionError,actionInfo,onApplyPlanDate}: Props) {
  const triggerRef=React.useRef<HTMLButtonElement>(null);
  if(!canEditPlanDate&&!planningAuth)return null;
  return <div className="sendings-inline-actions">
    {canEditPlanDate&&<>
      <button ref={triggerRef} type="button" className="sendings-action-icon sendings-action-icon--date" aria-label="Плановая дата прибытия на терминал" title="Проставить плановую дату прибытия на терминал для выбранных отправок" aria-expanded={planDateOpen} disabled={actionLoading||selectedCount===0} onClick={()=>{setEorMenuOpen(false);setPlanDateOpen(previous=>!previous);}}>
        {actionLoading?<Loader2 size={22} className="animate-spin" aria-hidden="true"/>:<CalendarClock size={22} aria-hidden="true"/>}
      </button>
      <FilterDropdownPortal triggerRef={triggerRef} popupWidth={260} isOpen={planDateOpen} onClose={()=>setPlanDateOpen(false)}>
        <div className="sendings-plan-date-popup" role="group" aria-label="Плановая дата прибытия на терминал">
          <label>Плановая дата прибытия на терминал<input type="date" value={planDateValue} onChange={event=>setPlanDateValue(event.target.value)} className="admin-form-input"/></label>
          <Button type="button" className="button-primary" disabled={actionLoading||!planDateValue} onClick={onApplyPlanDate}>Записать</Button>
        </div>
      </FilterDropdownPortal>
    </>}
    {planningAuth&&<SendingsPlanningButton auth={planningAuth}/>}
    {(actionError||actionInfo)&&<Typography.Body role={actionError?'alert':'status'} style={{color:actionError?'var(--color-error)':'var(--color-text-secondary)',whiteSpace:'normal'}}>{actionError||actionInfo}</Typography.Body>}
  </div>;
}
