import { it, expect, vi, afterEach } from 'vitest';
const platform = vi.hoisted(() => ({native:false,write:vi.fn(),share:vi.fn(),download:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>platform.native}}));
vi.mock('./capacitorPlatform',()=>({isCapacitorNative:()=>platform.native}));
vi.mock('./absoluteApiUrl',()=>({toAbsoluteApiUrl:(path:string)=>`https://api.example.test${path}`}));
vi.mock('@capacitor/filesystem',()=>({Filesystem:{writeFile:platform.write},Directory:{Cache:'CACHE'}}));
vi.mock('@capacitor/share',()=>({Share:{share:platform.share}}));
vi.mock('./triggerBlobDownload',()=>({triggerBlobDownload:platform.download}));
import { fetchDownloadDocumentDetailed } from './downloadDocumentDirect';
import { saveBlobFile } from './saveBlobFile';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it.each([false,true])('downloads through appropriate origin and saves on native=%s',async native=>{
  platform.native=native;
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:btoa('PDF'),name:'APP.pdf'}),{status:200}));
  vi.stubGlobal('fetch',fetch);
  platform.write.mockResolvedValue({uri:'file:///cache/APP.pdf'});
  platform.share.mockResolvedValue({});
  const result=await fetchDownloadDocumentDetailed({login:'u',password:'secret',isRegisteredUser:true},{metod:'АПП',number:'123'});
  expect(fetch.mock.calls[0][0]).toBe(native?'https://api.example.test/api/download':'/api/download');
  expect(JSON.parse(fetch.mock.calls[0][1].body).isRegisteredUser).toBe(true);
  expect(JSON.stringify(result.debug)).not.toContain('secret');
  expect(result.ok).toBe(true);
  await saveBlobFile(result.blob!,result.fileName!);
  if(native) { expect(platform.write).toHaveBeenCalled();expect(platform.share).toHaveBeenCalledWith(expect.objectContaining({files:['file:///cache/APP.pdf']}));expect(platform.download).not.toHaveBeenCalled(); }
  else expect(platform.download).toHaveBeenCalled();
});
