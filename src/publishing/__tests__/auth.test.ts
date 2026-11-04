import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {authorizeYouTube} from '../auth.js';
const calls=vi.hoisted(()=>({options:{} as Record<string,unknown>,token:vi.fn(async(_args:unknown)=>({tokens:{access_token:'test-access',refresh_token:'test-refresh'}}))}));
vi.mock('google-auth-library',()=>({CodeChallengeMethod:{S256:'S256'},OAuth2Client:class{
  constructor(_id:string,_secret:string,private redirect:string){}
  async generateCodeVerifierAsync(){return {codeVerifier:'test-verifier',codeChallenge:'test-challenge'};}
  generateAuthUrl(options:Record<string,unknown>){calls.options=options;const u=new URL('https://accounts.example.test/oauth');u.searchParams.set('redirect_uri',this.redirect);u.searchParams.set('state',String(options.state));return u.toString();}
  getToken(args:unknown){return calls.token(args);}
}}));
vi.mock('googleapis',()=>({google:{youtube:vi.fn()}}));
describe('desktop YouTube authorization',()=>{
  it('uses PKCE, rejects an invalid state, accepts the local callback and saves refresh credentials',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'oauth-flow-'));
    let callback:Promise<{invalid:number;valid:number}>|undefined;
    try{
      await mkdir(path.join(root,'secrets'));await writeFile(path.join(root,'secrets/client_secret.json'),JSON.stringify({installed:{client_id:'test-client',client_secret:'test-secret'}}));
      const authorization=authorizeYouTube(root,url=>{
        const u=new URL(url);const target=new URL(u.searchParams.get('redirect_uri')!);target.searchParams.set('code','test-code');target.searchParams.set('state',u.searchParams.get('state')!);
        callback=(async()=>{const bad=new URL(target);bad.searchParams.set('state','wrong-state');const invalid=await fetch(bad);const valid=await fetch(target);return {invalid:invalid.status,valid:valid.status};})();
      });
      await authorization;
      expect(await callback).toEqual({invalid:400,valid:200});
      expect(calls.options.code_challenge).toBe('test-challenge');expect(calls.options.code_challenge_method).toBe('S256');
      expect(String(calls.options.state).length).toBeGreaterThanOrEqual(32);
      expect(calls.token).toHaveBeenCalledWith({code:'test-code',codeVerifier:'test-verifier'});
      const token=JSON.parse(await readFile(path.join(root,'secrets/yt_token.json'),'utf8'));
      expect(token.refresh_token).toBe('test-refresh');
    }finally{await rm(root,{recursive:true,force:true});}
  },15000);
});
