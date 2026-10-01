import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {editContent,readEditor} from './editorStore';
import {getPublishedBlogArticle} from './editorPublicArticles';
import {readBlogIndex} from './editorPublicIndex';
import {countSitemapArticles} from './editorPublicSitemap';
let db:PGlite;let pool:Pool;
const migration=readFileSync(new URL('../../migrations/123_media_editor.sql',import.meta.url),'utf8');
const draft={article_slug:'example',article_title:'Проверенный материал',meta_description:'Короткий ответ',body_markdown:'## Условия\nПроверенный текст',author_name:'Редактор',source_notes:'Владелец подтвердил услугу 01.10.2026; без тарифов и сроков',channels:['site']};
beforeEach(async()=>{db=new PGlite();pool={query:(s:string,p?:unknown[])=>db.query(s,p),connect:async()=>({query:(s:string,p?:unknown[])=>db.query(s,p),release(){}})} as unknown as Pool;await db.exec(readFileSync(new URL('../../migrations/102_media_marketing.sql',import.meta.url),'utf8'));await db.exec(migration);await db.exec("insert into media_content_plans(title,planned_date) values ('Тема','2026-10-01')");},30000);
afterEach(async()=>{await db.close();});
it('saving, regeneration and restoring never replace or hide the published snapshot',async()=>{
 await editContent(pool,1,1,'save',draft,'editor');await editContent(pool,1,2,'publish',{confirm_review:true},'editor');
 await editContent(pool,1,2,'generated',{body_markdown:'Новый непроверенный текст',article_slug:'changed'},'generator');
 expect((await getPublishedBlogArticle(pool,'example'))?.body_markdown).toBe(draft.body_markdown);expect(await getPublishedBlogArticle(pool,'changed')).toBeNull();
 expect((await readBlogIndex(pool,1)).articles).toHaveLength(1);expect(await countSitemapArticles(pool)).toBe(1);
 await editContent(pool,1,3,'restore',{restore_revision:2},'editor');const state=await readEditor(pool,1);expect(state.plan.revision).toBe(4);expect(state.plan.body_markdown).toBe(draft.body_markdown);expect(state.publication.revision).toBe(2);
 await editContent(pool,1,4,'publish',{confirm_review:true},'editor');expect((await readEditor(pool,1)).publication.revision).toBe(4);
});
it('TG-only and incomplete drafts cannot publish or enter blog or sitemap',async()=>{
 await editContent(pool,1,1,'save',{...draft,channels:['telegram']},'editor');
 await expect(editContent(pool,1,2,'publish',{confirm_review:true},'editor')).rejects.toMatchObject({status:422});
 expect(await countSitemapArticles(pool)).toBe(0);expect((await readBlogIndex(pool,1)).articles).toEqual([]);
 await editContent(pool,1,2,'save',{channels:['site'],source_notes:''},'editor');await expect(editContent(pool,1,3,'publish',{confirm_review:true},'editor')).rejects.toMatchObject({status:422});
});
it('rejects stale edits and late generator results without losing any work',async()=>{
 await editContent(pool,1,1,'save',draft,'first');
 await expect(editContent(pool,1,1,'generated',{body_markdown:'stale'},'second')).rejects.toMatchObject({status:409});expect((await readEditor(pool,1)).plan.body_markdown).toBe(draft.body_markdown);
});
it('requires explicit review, prevents live URL changes, rejects collisions atomically',async()=>{
 await editContent(pool,1,1,'save',draft,'editor');await expect(editContent(pool,1,2,'publish',{},'editor')).rejects.toMatchObject({status:422});await editContent(pool,1,2,'publish',{confirm_review:true},'editor');
 await editContent(pool,1,2,'save',{article_slug:'different'},'editor');await expect(editContent(pool,1,3,'publish',{confirm_review:true},'editor')).rejects.toMatchObject({status:422});
 await db.exec("insert into media_content_plans(title,planned_date) values('Другой','2026-10-01')");await editContent(pool,2,1,'save',draft,'editor');await expect(editContent(pool,2,2,'publish',{confirm_review:true},'editor')).rejects.toMatchObject({status:409});expect(await countSitemapArticles(pool)).toBe(1);
});
it('legacy endpoints cannot bypass publication validation and every draft write has history',async()=>{
 await expect(db.exec("update media_content_plans set status='published',body_markdown='bypass' where id=1")).rejects.toThrow('versioned editor');
 await expect(db.exec("update media_content_plans set body_markdown='generated',status='draft' where id=1")).rejects.toThrow('versioned editor');await editContent(pool,1,1,'save',{body_markdown:'generated'},'editor');expect((await readEditor(pool,1)).revisions).toHaveLength(2);
 await expect(db.exec('delete from media_content_plans where id=1')).rejects.toThrow();
 await db.exec(migration);expect((await readEditor(pool,1)).revisions).toHaveLength(2);
});
