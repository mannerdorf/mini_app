import {useCallback,useState,type SetStateAction} from 'react';
import type {PlanDraft,SendingPlan} from './planningModel';

type Editor={draft:PlanDraft;initial:PlanDraft;plan?:SendingPlan};
type Editors={editor:Editor|null;drafts:Record<string,Editor>};
const changed=(editor:Editor|null)=>!!editor&&JSON.stringify(editor.draft)!==JSON.stringify(editor.initial);

export function usePlanningEditors() {
 const [state,setState]=useState<Editors>({editor:null,drafts:{}});
 const setEditor=useCallback((update:SetStateAction<Editor|null>)=>setState(previous=>({...previous,editor:typeof update==='function'?update(previous.editor):update})),[]);
 const switchEditor=useCallback((next:Editor,preserveCurrent=false)=>setState(previous=>{
  const drafts={...previous.drafts};
  if(preserveCurrent&&previous.editor?.plan&&changed(previous.editor))drafts[previous.editor.plan.id]=previous.editor;
  const id=next.plan?.id,editor=id&&drafts[id]?drafts[id]:next;
  if(id)delete drafts[id];
  return {editor,drafts};
 }),[]);
 const resetEditors=useCallback(()=>setState({editor:null,drafts:{}}),[]);
 const dirty=changed(state.editor);
 return {editor:state.editor,setEditor,switchEditor,resetEditors,dirty,hasUnsavedChanges:dirty||Object.keys(state.drafts).length>0};
}
