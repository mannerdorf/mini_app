import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getAdminTokenFromRequest,verifyAdminToken} from '../lib/adminAuth.js';
export default function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(!verifyAdminToken(getAdminTokenFromRequest(req)))return res.status(401).json({error:'Требуется авторизация админа'});
 return res.status(410).json({error:'Используйте очередь генерации с проверенными фактами'});
}
