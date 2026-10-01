/** Separate bounded one-shot process. Scheduler/paid generation are not enabled by installation. */
import {config} from 'dotenv';
config({path:process.env.HAULZ_ENV_FILE||'.env',quiet:true});
const {createAdminToken}=await import('../lib/adminAuth.js');
const r=await fetch('http://127.0.0.1:3000/api/admin-content-factory',{method:'POST',headers:{Authorization:`Bearer ${createAdminToken(false,'factory-worker')}`,'Content-Type':'application/json'},body:JSON.stringify({action:'run'}),signal:AbortSignal.timeout(150000)});
console.log(JSON.stringify({status:r.status,result:await r.json()}));if(!r.ok)process.exitCode=1;
