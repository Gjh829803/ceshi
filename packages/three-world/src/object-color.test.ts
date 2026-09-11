import {describe,expect,it,vi} from 'vitest';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial,ShaderMaterial,RawShaderMaterial,Color,Texture,DoubleSide,Plane,Vector3} from 'three';
import {setObjectColor} from './object-color';

describe('instance object color',()=>{
 it('isolates shared materials, preserves geometry and alpha, and restores without releasing source resources',()=>{
  const texture=new Texture(),source=new MeshStandardMaterial({color:'#000000',map:texture,alphaTest:.4,side:DoubleSide,
   visible:false,colorWrite:false,clippingPlanes:[new Plane(new Vector3(1,0,0),0)]});
  const geometry=new BoxGeometry(),a=new Mesh(geometry,[source,source]),b=new Mesh(geometry,source),root=new Group();root.add(a);
  const releaseSource=vi.spyOn(source,'dispose'),releaseTexture=vi.spyOn(texture,'dispose');
  const binding=setObjectColor(root,'#3184CA'),materials=a.material as MeshStandardMaterial[];
  expect(binding.color).toBe('#3184ca');expect(materials[0]).toBe(materials[1]);expect(materials[0]).not.toBe(source);
  expect(b.material).toBe(source);expect(source.color.getHexString()).toBe('000000');expect(a.geometry).toBe(geometry);
  expect(materials[0]).toMatchObject({map:texture,alphaTest:.4,side:DoubleSide,roughness:1,metalness:0});
  expect(materials[0]).toMatchObject({visible:false,colorWrite:false,clippingPlanes:source.clippingPlanes});
  const release=vi.spyOn(materials[0]!,'dispose');
  expect(setObjectColor(root,'#D67539')).toBe(binding);expect(materials[0]!.color.getHexString()).toBe('d67539');
  const later=new Mesh(geometry,source);root.add(later);binding.setColor('#8253b9');expect(later.material).toBe(source);
  binding.dispose();binding.dispose();expect(a.material).toEqual([source,source]);expect(release).toHaveBeenCalledOnce();
  expect(releaseSource).not.toHaveBeenCalled();expect(releaseTexture).not.toHaveBeenCalled();
  expect(()=>binding.setColor('#112233')).toThrow('OBJECT_COLOR_DISPOSED');
  geometry.dispose();source.dispose();texture.dispose();
 });
 it('rejects invalid colors and overlapping roots without partially changing materials',()=>{
  const source=new MeshStandardMaterial(),geometry=new BoxGeometry(),a=new Mesh(geometry,source),root=new Group();root.add(a);
  expect(()=>setObjectColor(root,'red')).toThrow('OBJECT_COLOR_INVALID');expect(a.material).toBe(source);
  const binding=setObjectColor(a,'#123456');expect(()=>setObjectColor(root,'#654321')).toThrow('OBJECT_COLOR_OVERLAP');
  expect(()=>binding.setColor('bad')).toThrow('OBJECT_COLOR_INVALID');expect(binding.color).toBe('#123456');binding.dispose();
  geometry.dispose();source.dispose();
 });
 describe.each([{name:'ShaderMaterial',Shader:ShaderMaterial},{name:'RawShaderMaterial',Shader:RawShaderMaterial}])('$name',({Shader})=>{
  it.each([
   {withColor:false,materialArray:false},{withColor:true,materialArray:false},
   {withColor:false,materialArray:true},{withColor:true,materialArray:true},
  ])('rejects atomically with color=$withColor and material array=$materialArray',({withColor,materialArray})=>{
   const geometry=new BoxGeometry(),source=new MeshStandardMaterial({color:'#abcdef'});
   const shader=new Shader({uniforms:{time:{value:42}},defines:{CUSTOM:1},
    vertexShader:'void main() { gl_Position = vec4(0.0); }',fragmentShader:'void main() { gl_FragColor = vec4(1.0); }'});
   if(withColor)Object.assign(shader,{color:new Color('#112233')});
   const shaderState={uniforms:shader.uniforms,defines:shader.defines,
    vertexShader:shader.vertexShader,fragmentShader:shader.fragmentShader};
   const root=new Group(),first=new Mesh(geometry,source),original=materialArray?[source,shader]:shader;
   const last:Mesh=new Mesh(geometry,original);root.add(first,last);
   const releaseSource=vi.spyOn(source,'dispose'),releaseShader=vi.spyOn(shader,'dispose');
   expect(()=>setObjectColor(root,'#3184ca')).toThrow('OBJECT_COLOR_MATERIAL_UNSUPPORTED');
   expect(first.material).toBe(source);expect(last.material).toBe(original);
   if(Array.isArray(original)){expect(original[0]).toBe(source);expect(original[1]).toBe(shader);}
   expect(source.color.getHexString()).toBe('abcdef');
   expect(shader.uniforms).toBe(shaderState.uniforms);expect(shader.defines).toBe(shaderState.defines);
   expect(shader).toMatchObject({...shaderState,uniforms:{time:{value:42}},defines:{CUSTOM:1}});
   expect(releaseSource).not.toHaveBeenCalled();expect(releaseShader).not.toHaveBeenCalled();
   last.material=source;
   const binding=setObjectColor(root,'#3184ca');
   expect(first.material).not.toBe(source);expect(last.material).toBe(first.material);
   binding.dispose();expect(first.material).toBe(source);expect(last.material).toBe(source);
   geometry.dispose();source.dispose();shader.dispose();
  });
 });
});
