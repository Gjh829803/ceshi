import {readCameraWorldPose} from './camera-observation';
import * as THREE from 'three';
import {expect,it} from 'vitest';
it('observes manual local/world camera matrices without mutating them',()=>{
 const parent=new THREE.Group(),camera=new THREE.PerspectiveCamera();parent.add(camera);
 parent.matrixAutoUpdate=false;parent.matrix.makeTranslation(7,8,9);
 camera.matrixAutoUpdate=false;camera.matrix.makeTranslation(1,2,3);
 expect(readCameraWorldPose(camera).position.toArray()).toEqual([8,10,12]);
 expect(camera.matrixWorld.elements).toEqual(new THREE.Matrix4().elements);
 camera.matrixWorldAutoUpdate=false;camera.matrixWorld.makeTranslation(20,30,40);
 expect(readCameraWorldPose(camera).position.toArray()).toEqual([20,30,40]);
 expect(camera.matrix.elements).toEqual(new THREE.Matrix4().makeTranslation(1,2,3).elements);
});
