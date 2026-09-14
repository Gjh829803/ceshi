import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it} from 'vitest';

function sampleBodies(source:string):ts.Node[]{
 const file=ts.createSourceFile('subject.ts',source,ts.ScriptTarget.Latest,true),result:ts.Node[]=[];
 const visit=(node:ts.Node)=>{if((ts.isMethodDeclaration(node)||ts.isFunctionDeclaration(node))&&node.body&&['sample','sampleHumanoidCameraSubject'].includes(node.name?.getText(file)??''))result.push(node.body);node.forEachChild(visit);};visit(file);return result;
}
function violations(node:ts.Node):string[]{
 const result:string[]=[];const visit=(value:ts.Node)=>{
  if(ts.isIdentifier(value)&&['camera','mainCamera','activeCamera','requestAnimationFrame','setTimeout','setInterval','addEventListener'].includes(value.text))result.push(value.text);
  value.forEachChild(visit);
 };visit(node);return result;
}
it('keeps actual ordinary and native subject samples free of camera, input and clock ownership',()=>{
 for(const path of ['camera/world-subject.ts','humanoid-runtime/camera-host.ts']){
  const bodies=sampleBodies(readFileSync(new URL('../../packages/three-world/src/'+path,import.meta.url),'utf8'));
  expect(bodies.length,path).toBe(1);expect(violations(bodies[0]!),path).toEqual([]);
 }
});
it('detects ownership violations inside sampling while allowing author composition outside it',()=>{
 expect(violations(sampleBodies('camera.position.set(1,2,3);function sample(){return {id:"actor"};}')[0]!)).toEqual([]);
 for(const expression of ['camera.position.set(1,2,3)','requestAnimationFrame(callback)','canvas.addEventListener("keydown",callback)'])expect(violations(sampleBodies(`function sample(){${expression};}`)[0]!).length).toBeGreaterThan(0);
});
