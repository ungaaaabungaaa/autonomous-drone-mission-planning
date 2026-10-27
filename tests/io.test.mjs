import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,stat,rm,readFile,writeFile}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{writeNewBundle}from'../src/io.ts';
test('a failed bundle write removes only its new files and preserves existing destinations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'drone-io-')),destination=join(root,'bundle');
 try{
  await assert.rejects(writeNewBundle(destination,{'plan.json':'first','absent/file.json':'fail'}));
  await assert.rejects(stat(destination),{code:'ENOENT'});
  await writeFile(join(root,'existing'),'preserve');
  await assert.rejects(writeNewBundle(join(root,'existing'),{'plan.json':'no'}));
  assert.equal(await readFile(join(root,'existing'),'utf8'),'preserve');
 }finally{await rm(root,{recursive:true,force:true});}
});
