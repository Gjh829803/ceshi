import {expect,it,vi} from 'vitest';
import {Bone,Group,Mesh,BoxGeometry,MeshBasicMaterial,Vector3,Quaternion} from 'three';
import {Character} from './character';
import type {Character as SourceCharacter} from './humanoid/source-character';

function fixture(){
 const root=new Group(),bones:Record<string,Bone>={};
 for(const name of ['head','spine_05','hand_l','hand_r']){
  const bone=new Bone();bone.name=name;bone.position.set(0,1,0);bone.rotation.z=Math.PI/2;root.add(bone);bones[name]=bone;
 }
 const source={root,bones,dispose:vi.fn(()=>root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();}))} as unknown as SourceCharacter;
 return {character:new Character(source),source,bones};
}
it('exposes semantic slots and follows bone transforms with metre offsets in calibrated axes',()=>{
 const {character,bones}=fixture(),hat=new Group();
 expect(character.attachmentPoints).toEqual(['head','back','handLeft','handRight']);
 const detach=character.attach('head',hat,{positionMetersXYZ:[0,.2,0]});
 character.root.updateMatrixWorld(true);
 expect(hat.getWorldPosition(new Vector3()).y).toBeCloseTo(1.36);
 expect(hat.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion())).toBeLessThan(1e-7);
 const before=hat.getWorldPosition(new Vector3());bones.head!.position.x=2;character.root.updateMatrixWorld(true);
 expect(hat.getWorldPosition(new Vector3()).x-before.x).toBeCloseTo(2);
 detach();detach();expect(hat.parent).toBeNull();character.dispose();
});
it('leaves author attachment transforms alone during animation presentation and isolates instances',()=>{
 const a=fixture(),b=fixture(),prop=new Group();a.character.attach('handRight',prop);
 a.character.capturePresentationPose();a.bones.hand_r!.position.y=2;a.character.capturePresentationPose();
 prop.rotation.x=.7;a.character.applyPresentationPose(.5);a.character.root.updateMatrixWorld(true);
 expect(prop.rotation.x).toBe(.7);expect(prop.getWorldPosition(new Vector3()).y).toBeCloseTo(1.5);
 expect(b.character.root.getObjectById(prop.id)).toBeUndefined();
 a.character.applyPresentationPose(1);expect(prop.rotation.x).toBe(.7);a.character.dispose();b.character.dispose();
});
it('detaches caller-owned resources before disposing the source model',()=>{
 const {character,source}=fixture(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());
 const dispose=vi.spyOn(mesh.geometry,'dispose');const detach=character.attach('back',mesh);
 character.dispose();expect(source.dispose).toHaveBeenCalledOnce();expect(mesh.parent).toBeNull();expect(dispose).not.toHaveBeenCalled();
 detach();mesh.geometry.dispose();mesh.material.dispose();
});
it('rejects unavailable slots, invalid transforms and already-parented or cyclic content before mutation',()=>{
 const empty=new Character(),object=new Group();expect(()=>empty.attach('head',object)).toThrow('ATTACHMENT_NOT_READY');
 const {character}=fixture();expect(()=>character.attach('unknown' as never,object)).toThrow('ATTACHMENT_SLOT_UNAVAILABLE');
 expect(()=>character.attach('head',object,{scale:-1})).toThrow('ATTACHMENT_TRANSFORM_INVALID');expect(object.parent).toBeNull();
 const parent=new Group();parent.add(object);expect(()=>character.attach('head',object)).toThrow('ATTACHMENT_OBJECT_PARENTED');expect(object.parent).toBe(parent);
 expect(()=>character.attach('head',character.root)).toThrow('ATTACHMENT_CYCLE');character.dispose();
});
