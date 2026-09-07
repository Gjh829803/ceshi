"use strict";
export const validateSubjectDefinitionV1 = validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"worldkit://schema/subject-definition@1","type":"object","additionalProperties":false,"required":["id","version","kind","authoringAvailability","category","bodyTopology","semanticClassId","coordinateConvention","visualParts","visualBinding","sockets","mountSlots","colliderPolicy","capabilityRefs","profiles","relationshipCapabilityRefs","actionOrPoseSetRef","renderBindingProfileRef","allowedOverridePaths","aiMetadata"],"properties":{"id":{"$ref":"#/$defs/id"},"version":{"const":1},"kind":{"const":"subject-definition"},"authoringAvailability":{"enum":["recommended","advanced","experimental"]},"category":{"enum":["human","animal","custom"]},"bodyTopology":{"enum":["biped","quadruped","custom"]},"semanticClassId":{"$ref":"#/$defs/nonEmptyString"},"coordinateConvention":{"type":"object","additionalProperties":false,"required":["forwardAxis","upAxis","metersPerUnit","pivot"],"properties":{"forwardAxis":{"const":"-Z"},"upAxis":{"const":"+Y"},"metersPerUnit":{"const":1},"pivot":{"const":"support-center"}}},"visualParts":{"type":"array","minItems":1,"maxItems":128,"items":{"$ref":"#/$defs/visualPart"}},"visualBinding":{"$ref":"#/$defs/visualBinding"},"sockets":{"type":"array","maxItems":64,"items":{"$ref":"#/$defs/socket"}},"mountSlots":{"type":"array","maxItems":16,"items":{"$ref":"#/$defs/mountSlot"}},"colliderPolicy":{"$ref":"#/$defs/colliderPolicy"},"capabilityRefs":{"type":"array","minItems":1,"maxItems":16,"uniqueItems":true,"items":{"type":"string","format":"capability-ref"}},"profiles":{"type":"object","additionalProperties":false,"required":["physicsBodyProfileRef","locomotionProfileRef","controlFeelProfileRef","allowedControlFeelProfileRefs","motion","controlProfileRef","cameraContextProfileRef","mediumProfileRef","harnessProfileRef"],"properties":{"physicsBodyProfileRef":{"type":"string","format":"physics-body-profile-ref"},"locomotionProfileRef":{"type":"string","format":"locomotion-profile-ref"},"controlFeelProfileRef":{"type":"string","pattern":"^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"allowedControlFeelProfileRefs":{"type":"array","minItems":1,"maxItems":16,"uniqueItems":true,"items":{"type":"string","pattern":"^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}},"motion":{"type":"object","additionalProperties":false,"required":["defaultMotionProfileRef","optionalMotionProfileRefs","fallbackMotionProfileRef"],"properties":{"defaultMotionProfileRef":{"type":"string","pattern":"^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"optionalMotionProfileRefs":{"type":"array","maxItems":16,"uniqueItems":true,"items":{"type":"string","pattern":"^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}},"fallbackMotionProfileRef":{"type":"string","pattern":"^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}}},"controlProfileRef":{"type":"string","pattern":"^worldkit://control-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"cameraContextProfileRef":{"type":"string","pattern":"^worldkit://camera-context/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"mediumProfileRef":{"type":"string","pattern":"^worldkit://medium-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"harnessProfileRef":{"type":"string","pattern":"^worldkit://harness-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}}},"relationshipCapabilityRefs":{"type":"array","maxItems":16,"uniqueItems":true,"items":{"type":"string","format":"capability-ref"}},"actionOrPoseSetRef":{"type":"string","pattern":"^worldkit://(?:animation-set|pose-set)/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"renderBindingProfileRef":{"type":"string","pattern":"^worldkit://render-binding/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"allowedOverridePaths":{"type":"array","maxItems":3,"uniqueItems":true,"items":{"enum":["profiles.controlFeelProfileRef","profiles.controlProfileRef","profiles.motion.defaultMotionProfileRef"]}},"aiMetadata":{"type":"object","additionalProperties":false,"required":["displayName","description","semanticTags"],"properties":{"displayName":{"type":"string","minLength":1,"maxLength":120},"description":{"type":"string","minLength":1,"maxLength":1000},"semanticTags":{"$ref":"#/$defs/semanticTags"}}}},"allOf":[{"if":{"properties":{"visualBinding":{"type":"object","required":["mode"],"properties":{"mode":{"const":"rigged"}}}}},"then":{"properties":{"visualParts":{"type":"array","contains":{"type":"object","required":["kind"],"properties":{"kind":{"const":"asset"}}},"minContains":1}}}}],"$defs":{"id":{"type":"string","pattern":"^[a-z0-9][a-z0-9.-]{0,63}$"},"socketId":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$"},"nonEmptyString":{"type":"string","minLength":1,"maxLength":128},"positiveNumber":{"type":"number","exclusiveMinimum":0},"vec3":{"type":"array","prefixItems":[{"type":"number"},{"type":"number"},{"type":"number"}],"items":false,"minItems":3,"maxItems":3},"positiveVec3":{"type":"array","prefixItems":[{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"}],"items":false,"minItems":3,"maxItems":3},"semanticTags":{"type":"array","maxItems":32,"uniqueItems":true,"items":{"type":"string","pattern":"^[a-z0-9][a-z0-9.-]{0,63}$"}},"localTransform":{"type":"object","additionalProperties":false,"required":["positionMetersXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"}}},"assetLocalTransform":{"type":"object","additionalProperties":false,"required":["positionMetersXYZ","scaleXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"},"scaleXYZ":{"$ref":"#/$defs/positiveVec3"}}},"shape":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","sizeMetersXYZ"],"properties":{"kind":{"const":"box"},"sizeMetersXYZ":{"$ref":"#/$defs/positiveVec3"}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters"],"properties":{"kind":{"const":"sphere"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters"],"properties":{"kind":{"const":"cylinder"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"heightMeters":{"$ref":"#/$defs/positiveNumber"}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters"],"properties":{"kind":{"const":"capsule"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"heightMeters":{"$ref":"#/$defs/positiveNumber"}}}]},"visualPart":{"oneOf":[{"type":"object","additionalProperties":false,"required":["id","kind","shape","localTransform","colliderContribution","semanticTags"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"primitive"},"shape":{"$ref":"#/$defs/shape"},"localTransform":{"$ref":"#/$defs/localTransform"},"colliderContribution":{"enum":["include","exclude"]},"semanticTags":{"$ref":"#/$defs/semanticTags"}}},{"type":"object","additionalProperties":false,"required":["id","kind","subjectAssetRef","localTransform","appearance","semanticTags"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"asset"},"subjectAssetRef":{"type":"string","pattern":"^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"localTransform":{"$ref":"#/$defs/assetLocalTransform"},"appearance":{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"whitebox-neutral"}}},"semanticTags":{"$ref":"#/$defs/semanticTags"}}}]},"visualBinding":{"oneOf":[{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"static"}}},{"type":"object","additionalProperties":false,"required":["mode","rigProfileRef","animationSetRef"],"properties":{"mode":{"const":"rigged"},"rigProfileRef":{"type":"string","pattern":"^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"animationSetRef":{"type":"string","pattern":"^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}}}]},"colliderPolicy":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","colliderDerivationProfileRef"],"properties":{"kind":{"const":"derive"},"colliderDerivationProfileRef":{"type":"string","format":"collider-derivation-profile-ref"}}},{"type":"object","additionalProperties":false,"required":["kind","colliderProfileRef"],"properties":{"kind":{"const":"profile"},"colliderProfileRef":{"type":"string","pattern":"^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}}}]},"socket":{"oneOf":[{"type":"object","additionalProperties":false,"required":["id","kind","localTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/socketId"},"kind":{"const":"local"},"localTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/semanticTags"}}},{"type":"object","additionalProperties":false,"required":["id","kind","boneId","offsetTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/socketId"},"kind":{"const":"bone"},"boneId":{"enum":["hips","spine","chest","neck","head","upper-arm.left","lower-arm.left","hand.left","upper-arm.right","lower-arm.right","hand.right","upper-leg.left","lower-leg.left","foot.left","upper-leg.right","lower-leg.right","foot.right"]},"offsetTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/semanticTags"}}}]},"mountSlot":{"type":"object","additionalProperties":false,"required":["id","kind","mode","mountSocketId","riderSubjectOriginOffsetMetersXYZ","dismountCandidateOffsetsMetersXYZ"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"mount-slot"},"mode":{"const":"stand"},"mountSocketId":{"$ref":"#/$defs/socketId"},"riderSubjectOriginOffsetMetersXYZ":{"$ref":"#/$defs/vec3"},"dismountCandidateOffsetsMetersXYZ":{"type":"array","minItems":1,"maxItems":8,"uniqueItems":true,"items":{"$ref":"#/$defs/vec3"}}}}}};
const schema32 = {"type":"string","pattern":"^[a-z0-9][a-z0-9.-]{0,63}$"};
const schema33 = {"type":"string","minLength":1,"maxLength":128};
const schema55 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"static"}}},{"type":"object","additionalProperties":false,"required":["mode","rigProfileRef","animationSetRef"],"properties":{"mode":{"const":"rigged"},"rigProfileRef":{"type":"string","pattern":"^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"animationSetRef":{"type":"string","pattern":"^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}}}]};
const schema66 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","colliderDerivationProfileRef"],"properties":{"kind":{"const":"derive"},"colliderDerivationProfileRef":{"type":"string","format":"collider-derivation-profile-ref"}}},{"type":"object","additionalProperties":false,"required":["kind","colliderProfileRef"],"properties":{"kind":{"const":"profile"},"colliderProfileRef":{"type":"string","pattern":"^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}}}]};
const schema49 = {"type":"array","maxItems":32,"uniqueItems":true,"items":{"type":"string","pattern":"^[a-z0-9][a-z0-9.-]{0,63}$"}};
const func1 = Object.prototype.hasOwnProperty;
import func2Module from "ajv/dist/runtime/ucs2length.js";
const func2 = typeof func2Module === "function" ? func2Module : func2Module.default;
import func0Module from "ajv/dist/runtime/equal.js";
const func0 = typeof func0Module === "function" ? func0Module : func0Module.default;
const pattern4 = new RegExp("^[a-z0-9][a-z0-9.-]{0,63}$", "u");
const pattern10 = new RegExp("^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern11 = new RegExp("^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern18 = new RegExp("^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern19 = new RegExp("^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern21 = new RegExp("^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern24 = new RegExp("^worldkit://control-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern25 = new RegExp("^worldkit://camera-context/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern26 = new RegExp("^worldkit://medium-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern27 = new RegExp("^worldkit://harness-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern28 = new RegExp("^worldkit://(?:animation-set|pose-set)/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const pattern29 = new RegExp("^worldkit://render-binding/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const schema34 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["id","kind","shape","localTransform","colliderContribution","semanticTags"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"primitive"},"shape":{"$ref":"#/$defs/shape"},"localTransform":{"$ref":"#/$defs/localTransform"},"colliderContribution":{"enum":["include","exclude"]},"semanticTags":{"$ref":"#/$defs/semanticTags"}}},{"type":"object","additionalProperties":false,"required":["id","kind","subjectAssetRef","localTransform","appearance","semanticTags"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"asset"},"subjectAssetRef":{"type":"string","pattern":"^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},"localTransform":{"$ref":"#/$defs/assetLocalTransform"},"appearance":{"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"whitebox-neutral"}}},"semanticTags":{"$ref":"#/$defs/semanticTags"}}}]};
const pattern8 = new RegExp("^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const schema36 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","sizeMetersXYZ"],"properties":{"kind":{"const":"box"},"sizeMetersXYZ":{"$ref":"#/$defs/positiveVec3"}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters"],"properties":{"kind":{"const":"sphere"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters"],"properties":{"kind":{"const":"cylinder"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"heightMeters":{"$ref":"#/$defs/positiveNumber"}}},{"type":"object","additionalProperties":false,"required":["kind","radiusMeters","heightMeters"],"properties":{"kind":{"const":"capsule"},"radiusMeters":{"$ref":"#/$defs/positiveNumber"},"heightMeters":{"$ref":"#/$defs/positiveNumber"}}}]};
const schema38 = {"type":"number","exclusiveMinimum":0};
const schema37 = {"type":"array","prefixItems":[{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"},{"$ref":"#/$defs/positiveNumber"}],"items":false,"minItems":3,"maxItems":3};

function validate23(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate23.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(Array.isArray(data)){
if(data.length > 3){
const err0 = {instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.length < 3){
const err1 = {instancePath,schemaPath:"#/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
const len0 = data.length;
if(len0 > 0){
let data0 = data[0];
if((typeof data0 == "number") && (isFinite(data0))){
if(data0 <= 0 || isNaN(data0)){
const err2 = {instancePath:instancePath+"/0",schemaPath:"#/$defs/positiveNumber/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/0",schemaPath:"#/$defs/positiveNumber/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(len0 > 1){
let data1 = data[1];
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 <= 0 || isNaN(data1)){
const err4 = {instancePath:instancePath+"/1",schemaPath:"#/$defs/positiveNumber/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/1",schemaPath:"#/$defs/positiveNumber/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(len0 > 2){
let data2 = data[2];
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 <= 0 || isNaN(data2)){
const err6 = {instancePath:instancePath+"/2",schemaPath:"#/$defs/positiveNumber/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/2",schemaPath:"#/$defs/positiveNumber/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
const len1 = data.length;
if(!(len1 <= 3)){
const err8 = {instancePath,schemaPath:"#/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate23.errors = vErrors;
return errors === 0;
}
validate23.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};


function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.sizeMetersXYZ === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "sizeMetersXYZ"},message:"must have required property '"+"sizeMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "sizeMetersXYZ"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
if("box" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "box"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.sizeMetersXYZ !== undefined){
if(!(validate23(data.sizeMetersXYZ, {instancePath:instancePath+"/sizeMetersXYZ",parentData:data,parentDataProperty:"sizeMetersXYZ",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs6 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err5 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.radiusMeters === undefined){
const err6 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "radiusMeters"},message:"must have required property '"+"radiusMeters"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data){
if(!((key1 === "kind") || (key1 === "radiusMeters"))){
const err7 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
if("sphere" !== data.kind){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "sphere"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.radiusMeters !== undefined){
let data3 = data.radiusMeters;
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 <= 0 || isNaN(data3)){
const err9 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/$defs/positiveNumber/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/$defs/positiveNumber/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs6 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs13 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err12 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.radiusMeters === undefined){
const err13 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "radiusMeters"},message:"must have required property '"+"radiusMeters"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.heightMeters === undefined){
const err14 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "heightMeters"},message:"must have required property '"+"heightMeters"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key2 in data){
if(!(((key2 === "kind") || (key2 === "radiusMeters")) || (key2 === "heightMeters"))){
const err15 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.kind !== undefined){
if("cylinder" !== data.kind){
const err16 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "cylinder"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.radiusMeters !== undefined){
let data5 = data.radiusMeters;
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 <= 0 || isNaN(data5)){
const err17 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/$defs/positiveNumber/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/$defs/positiveNumber/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.heightMeters !== undefined){
let data6 = data.heightMeters;
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 <= 0 || isNaN(data6)){
const err19 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/$defs/positiveNumber/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/$defs/positiveNumber/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var _valid0 = _errs13 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs23 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err22 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data.radiusMeters === undefined){
const err23 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "radiusMeters"},message:"must have required property '"+"radiusMeters"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.heightMeters === undefined){
const err24 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "heightMeters"},message:"must have required property '"+"heightMeters"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
for(const key3 in data){
if(!(((key3 === "kind") || (key3 === "radiusMeters")) || (key3 === "heightMeters"))){
const err25 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.kind !== undefined){
if("capsule" !== data.kind){
const err26 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "capsule"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.radiusMeters !== undefined){
let data8 = data.radiusMeters;
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 <= 0 || isNaN(data8)){
const err27 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/$defs/positiveNumber/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/radiusMeters",schemaPath:"#/$defs/positiveNumber/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.heightMeters !== undefined){
let data9 = data.heightMeters;
if((typeof data9 == "number") && (isFinite(data9))){
if(data9 <= 0 || isNaN(data9)){
const err29 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/$defs/positiveNumber/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/heightMeters",schemaPath:"#/$defs/positiveNumber/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var _valid0 = _errs23 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
}
}
}
if(!valid0){
const err32 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate22.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate22.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema46 = {"type":"object","additionalProperties":false,"required":["positionMetersXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"}}};
const schema47 = {"type":"array","prefixItems":[{"type":"number"},{"type":"number"},{"type":"number"}],"items":false,"minItems":3,"maxItems":3};

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate26.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.positionMetersXYZ === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "positionMetersXYZ"},message:"must have required property '"+"positionMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "positionMetersXYZ") || (key0 === "rotationEulerRadiansXYZ"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.positionMetersXYZ !== undefined){
let data0 = data.positionMetersXYZ;
if(Array.isArray(data0)){
if(data0.length > 3){
const err2 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data0.length < 3){
const err3 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
const len0 = data0.length;
if(len0 > 0){
let data1 = data0[0];
if(!((typeof data1 == "number") && (isFinite(data1)))){
const err4 = {instancePath:instancePath+"/positionMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(len0 > 1){
let data2 = data0[1];
if(!((typeof data2 == "number") && (isFinite(data2)))){
const err5 = {instancePath:instancePath+"/positionMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(len0 > 2){
let data3 = data0[2];
if(!((typeof data3 == "number") && (isFinite(data3)))){
const err6 = {instancePath:instancePath+"/positionMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
const len1 = data0.length;
if(!(len1 <= 3)){
const err7 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.rotationEulerRadiansXYZ !== undefined){
let data4 = data.rotationEulerRadiansXYZ;
if(Array.isArray(data4)){
if(data4.length > 3){
const err9 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data4.length < 3){
const err10 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
const len2 = data4.length;
if(len2 > 0){
let data5 = data4[0];
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err11 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(len2 > 1){
let data6 = data4[1];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err12 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(len2 > 2){
let data7 = data4[2];
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err13 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
const len3 = data4.length;
if(!(len3 <= 3)){
const err14 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate26.errors = vErrors;
return errors === 0;
}
validate26.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema51 = {"type":"object","additionalProperties":false,"required":["positionMetersXYZ","scaleXYZ"],"properties":{"positionMetersXYZ":{"$ref":"#/$defs/vec3"},"rotationEulerRadiansXYZ":{"$ref":"#/$defs/vec3"},"scaleXYZ":{"$ref":"#/$defs/positiveVec3"}}};

function validate28(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate28.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.positionMetersXYZ === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "positionMetersXYZ"},message:"must have required property '"+"positionMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.scaleXYZ === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scaleXYZ"},message:"must have required property '"+"scaleXYZ"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "positionMetersXYZ") || (key0 === "rotationEulerRadiansXYZ")) || (key0 === "scaleXYZ"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.positionMetersXYZ !== undefined){
let data0 = data.positionMetersXYZ;
if(Array.isArray(data0)){
if(data0.length > 3){
const err3 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data0.length < 3){
const err4 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
const len0 = data0.length;
if(len0 > 0){
let data1 = data0[0];
if(!((typeof data1 == "number") && (isFinite(data1)))){
const err5 = {instancePath:instancePath+"/positionMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(len0 > 1){
let data2 = data0[1];
if(!((typeof data2 == "number") && (isFinite(data2)))){
const err6 = {instancePath:instancePath+"/positionMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(len0 > 2){
let data3 = data0[2];
if(!((typeof data3 == "number") && (isFinite(data3)))){
const err7 = {instancePath:instancePath+"/positionMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
const len1 = data0.length;
if(!(len1 <= 3)){
const err8 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.rotationEulerRadiansXYZ !== undefined){
let data4 = data.rotationEulerRadiansXYZ;
if(Array.isArray(data4)){
if(data4.length > 3){
const err10 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data4.length < 3){
const err11 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len2 = data4.length;
if(len2 > 0){
let data5 = data4[0];
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err12 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(len2 > 1){
let data6 = data4[1];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err13 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(len2 > 2){
let data7 = data4[2];
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err14 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
const len3 = data4.length;
if(!(len3 <= 3)){
const err15 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.scaleXYZ !== undefined){
if(!(validate23(data.scaleXYZ, {instancePath:instancePath+"/scaleXYZ",parentData:data,parentDataProperty:"scaleXYZ",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate28.errors = vErrors;
return errors === 0;
}
validate28.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.shape === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "shape"},message:"must have required property '"+"shape"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.localTransform === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "localTransform"},message:"must have required property '"+"localTransform"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.colliderContribution === undefined){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "colliderContribution"},message:"must have required property '"+"colliderContribution"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.semanticTags === undefined){
const err5 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "kind")) || (key0 === "shape")) || (key0 === "localTransform")) || (key0 === "colliderContribution")) || (key0 === "semanticTags"))){
const err6 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern4.test(data0)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
if("primitive" !== data.kind){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "primitive"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.shape !== undefined){
if(!(validate22(data.shape, {instancePath:instancePath+"/shape",parentData:data,parentDataProperty:"shape",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
}
if(data.localTransform !== undefined){
if(!(validate26(data.localTransform, {instancePath:instancePath+"/localTransform",parentData:data,parentDataProperty:"localTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
if(data.colliderContribution !== undefined){
let data4 = data.colliderContribution;
if(!((data4 === "include") || (data4 === "exclude"))){
const err10 = {instancePath:instancePath+"/colliderContribution",schemaPath:"#/oneOf/0/properties/colliderContribution/enum",keyword:"enum",params:{allowedValues: schema34.oneOf[0].properties.colliderContribution.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.semanticTags !== undefined){
let data5 = data.semanticTags;
if(Array.isArray(data5)){
if(data5.length > 32){
const err11 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/maxItems",keyword:"maxItems",params:{limit: 32},message:"must NOT have more than 32 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(!pattern4.test(data6)){
const err12 = {instancePath:instancePath+"/semanticTags/" + i0,schemaPath:"#/$defs/semanticTags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/semanticTags/" + i0,schemaPath:"#/$defs/semanticTags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
const indices0 = {};
for(;i1--;){
let item0 = data5[i1];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err14 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
break;
}
indices0[item0] = i1;
}
}
}
else {
const err15 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props1 = true;
}
const _errs16 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err17 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data.kind === undefined){
const err18 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data.subjectAssetRef === undefined){
const err19 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "subjectAssetRef"},message:"must have required property '"+"subjectAssetRef"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data.localTransform === undefined){
const err20 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "localTransform"},message:"must have required property '"+"localTransform"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data.appearance === undefined){
const err21 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "appearance"},message:"must have required property '"+"appearance"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data.semanticTags === undefined){
const err22 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
for(const key1 in data){
if(!((((((key1 === "id") || (key1 === "kind")) || (key1 === "subjectAssetRef")) || (key1 === "localTransform")) || (key1 === "appearance")) || (key1 === "semanticTags"))){
const err23 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.id !== undefined){
let data7 = data.id;
if(typeof data7 === "string"){
if(!pattern4.test(data7)){
const err24 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.kind !== undefined){
if("asset" !== data.kind){
const err26 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "asset"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.subjectAssetRef !== undefined){
let data9 = data.subjectAssetRef;
if(typeof data9 === "string"){
if(!pattern8.test(data9)){
const err27 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"#/oneOf/1/properties/subjectAssetRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"#/oneOf/1/properties/subjectAssetRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.localTransform !== undefined){
if(!(validate28(data.localTransform, {instancePath:instancePath+"/localTransform",parentData:data,parentDataProperty:"localTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
}
if(data.appearance !== undefined){
let data11 = data.appearance;
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
if(data11.mode === undefined){
const err29 = {instancePath:instancePath+"/appearance",schemaPath:"#/oneOf/1/properties/appearance/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
for(const key2 in data11){
if(!(key2 === "mode")){
const err30 = {instancePath:instancePath+"/appearance",schemaPath:"#/oneOf/1/properties/appearance/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data11.mode !== undefined){
if("whitebox-neutral" !== data11.mode){
const err31 = {instancePath:instancePath+"/appearance/mode",schemaPath:"#/oneOf/1/properties/appearance/properties/mode/const",keyword:"const",params:{allowedValue: "whitebox-neutral"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath:instancePath+"/appearance",schemaPath:"#/oneOf/1/properties/appearance/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.semanticTags !== undefined){
let data13 = data.semanticTags;
if(Array.isArray(data13)){
if(data13.length > 32){
const err33 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/maxItems",keyword:"maxItems",params:{limit: 32},message:"must NOT have more than 32 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len1 = data13.length;
for(let i2=0; i2<len1; i2++){
let data14 = data13[i2];
if(typeof data14 === "string"){
if(!pattern4.test(data14)){
const err34 = {instancePath:instancePath+"/semanticTags/" + i2,schemaPath:"#/$defs/semanticTags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/semanticTags/" + i2,schemaPath:"#/$defs/semanticTags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
let i3 = data13.length;
let j1;
if(i3 > 1){
const indices1 = {};
for(;i3--;){
let item1 = data13[i3];
if(typeof item1 !== "string"){
continue;
}
if(typeof indices1[item1] == "number"){
j1 = indices1[item1];
const err36 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
indices1[item1] = i3;
}
}
}
else {
const err37 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
else {
const err38 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var _valid0 = _errs16 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props1 !== true){
props1 = true;
}
}
}
if(!valid0){
const err39 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate21.errors = vErrors;
evaluated0.props = props1;
return errors === 0;
}
validate21.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema56 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["id","kind","localTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/socketId"},"kind":{"const":"local"},"localTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/semanticTags"}}},{"type":"object","additionalProperties":false,"required":["id","kind","boneId","offsetTransform","semanticTags"],"properties":{"id":{"$ref":"#/$defs/socketId"},"kind":{"const":"bone"},"boneId":{"enum":["hips","spine","chest","neck","head","upper-arm.left","lower-arm.left","hand.left","upper-arm.right","lower-arm.right","hand.right","upper-leg.left","lower-leg.left","foot.left","upper-leg.right","lower-leg.right","foot.right"]},"offsetTransform":{"$ref":"#/$defs/localTransform"},"semanticTags":{"$ref":"#/$defs/semanticTags"}}}]};
const schema57 = {"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$"};
const pattern12 = new RegExp("^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$", "u");

function validate32(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate32.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.localTransform === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "localTransform"},message:"must have required property '"+"localTransform"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.semanticTags === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "id") || (key0 === "kind")) || (key0 === "localTransform")) || (key0 === "semanticTags"))){
const err4 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern12.test(data0)){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/socketId/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/socketId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.kind !== undefined){
if("local" !== data.kind){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "local"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.localTransform !== undefined){
if(!(validate26(data.localTransform, {instancePath:instancePath+"/localTransform",parentData:data,parentDataProperty:"localTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
if(data.semanticTags !== undefined){
let data3 = data.semanticTags;
if(Array.isArray(data3)){
if(data3.length > 32){
const err8 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/maxItems",keyword:"maxItems",params:{limit: 32},message:"must NOT have more than 32 items"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(typeof data4 === "string"){
if(!pattern4.test(data4)){
const err9 = {instancePath:instancePath+"/semanticTags/" + i0,schemaPath:"#/$defs/semanticTags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/semanticTags/" + i0,schemaPath:"#/$defs/semanticTags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
let i1 = data3.length;
let j0;
if(i1 > 1){
const indices0 = {};
for(;i1--;){
let item0 = data3[i1];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err11 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
break;
}
indices0[item0] = i1;
}
}
}
else {
const err12 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs14 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err14 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.kind === undefined){
const err15 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.boneId === undefined){
const err16 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "boneId"},message:"must have required property '"+"boneId"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.offsetTransform === undefined){
const err17 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "offsetTransform"},message:"must have required property '"+"offsetTransform"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data.semanticTags === undefined){
const err18 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
for(const key1 in data){
if(!(((((key1 === "id") || (key1 === "kind")) || (key1 === "boneId")) || (key1 === "offsetTransform")) || (key1 === "semanticTags"))){
const err19 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.id !== undefined){
let data5 = data.id;
if(typeof data5 === "string"){
if(!pattern12.test(data5)){
const err20 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/socketId/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/socketId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.kind !== undefined){
if("bone" !== data.kind){
const err22 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "bone"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.boneId !== undefined){
let data7 = data.boneId;
if(!(((((((((((((((((data7 === "hips") || (data7 === "spine")) || (data7 === "chest")) || (data7 === "neck")) || (data7 === "head")) || (data7 === "upper-arm.left")) || (data7 === "lower-arm.left")) || (data7 === "hand.left")) || (data7 === "upper-arm.right")) || (data7 === "lower-arm.right")) || (data7 === "hand.right")) || (data7 === "upper-leg.left")) || (data7 === "lower-leg.left")) || (data7 === "foot.left")) || (data7 === "upper-leg.right")) || (data7 === "lower-leg.right")) || (data7 === "foot.right"))){
const err23 = {instancePath:instancePath+"/boneId",schemaPath:"#/oneOf/1/properties/boneId/enum",keyword:"enum",params:{allowedValues: schema56.oneOf[1].properties.boneId.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.offsetTransform !== undefined){
if(!(validate26(data.offsetTransform, {instancePath:instancePath+"/offsetTransform",parentData:data,parentDataProperty:"offsetTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
if(data.semanticTags !== undefined){
let data9 = data.semanticTags;
if(Array.isArray(data9)){
if(data9.length > 32){
const err24 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/maxItems",keyword:"maxItems",params:{limit: 32},message:"must NOT have more than 32 items"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
const len1 = data9.length;
for(let i2=0; i2<len1; i2++){
let data10 = data9[i2];
if(typeof data10 === "string"){
if(!pattern4.test(data10)){
const err25 = {instancePath:instancePath+"/semanticTags/" + i2,schemaPath:"#/$defs/semanticTags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/semanticTags/" + i2,schemaPath:"#/$defs/semanticTags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
let i3 = data9.length;
let j1;
if(i3 > 1){
const indices1 = {};
for(;i3--;){
let item1 = data9[i3];
if(typeof item1 !== "string"){
continue;
}
if(typeof indices1[item1] == "number"){
j1 = indices1[item1];
const err27 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
break;
}
indices1[item1] = i3;
}
}
}
else {
const err28 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
else {
const err29 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var _valid0 = _errs14 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err30 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate32.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate32.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema61 = {"type":"object","additionalProperties":false,"required":["id","kind","mode","mountSocketId","riderSubjectOriginOffsetMetersXYZ","dismountCandidateOffsetsMetersXYZ"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"mount-slot"},"mode":{"const":"stand"},"mountSocketId":{"$ref":"#/$defs/socketId"},"riderSubjectOriginOffsetMetersXYZ":{"$ref":"#/$defs/vec3"},"dismountCandidateOffsetsMetersXYZ":{"type":"array","minItems":1,"maxItems":8,"uniqueItems":true,"items":{"$ref":"#/$defs/vec3"}}}};

function validate36(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate36.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.mode === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.mountSocketId === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mountSocketId"},message:"must have required property '"+"mountSocketId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.riderSubjectOriginOffsetMetersXYZ === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "riderSubjectOriginOffsetMetersXYZ"},message:"must have required property '"+"riderSubjectOriginOffsetMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.dismountCandidateOffsetsMetersXYZ === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "dismountCandidateOffsetsMetersXYZ"},message:"must have required property '"+"dismountCandidateOffsetsMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "kind")) || (key0 === "mode")) || (key0 === "mountSocketId")) || (key0 === "riderSubjectOriginOffsetMetersXYZ")) || (key0 === "dismountCandidateOffsetsMetersXYZ"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern4.test(data0)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
if("mount-slot" !== data.kind){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "mount-slot"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.mode !== undefined){
if("stand" !== data.mode){
const err10 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "stand"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.mountSocketId !== undefined){
let data3 = data.mountSocketId;
if(typeof data3 === "string"){
if(!pattern12.test(data3)){
const err11 = {instancePath:instancePath+"/mountSocketId",schemaPath:"#/$defs/socketId/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/mountSocketId",schemaPath:"#/$defs/socketId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.riderSubjectOriginOffsetMetersXYZ !== undefined){
let data4 = data.riderSubjectOriginOffsetMetersXYZ;
if(Array.isArray(data4)){
if(data4.length > 3){
const err13 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data4.length < 3){
const err14 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
const len0 = data4.length;
if(len0 > 0){
let data5 = data4[0];
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err15 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(len0 > 1){
let data6 = data4[1];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err16 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(len0 > 2){
let data7 = data4[2];
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err17 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
const len1 = data4.length;
if(!(len1 <= 3)){
const err18 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/riderSubjectOriginOffsetMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.dismountCandidateOffsetsMetersXYZ !== undefined){
let data8 = data.dismountCandidateOffsetsMetersXYZ;
if(Array.isArray(data8)){
if(data8.length > 8){
const err20 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ",schemaPath:"#/properties/dismountCandidateOffsetsMetersXYZ/maxItems",keyword:"maxItems",params:{limit: 8},message:"must NOT have more than 8 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data8.length < 1){
const err21 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ",schemaPath:"#/properties/dismountCandidateOffsetsMetersXYZ/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
const len2 = data8.length;
for(let i0=0; i0<len2; i0++){
let data9 = data8[i0];
if(Array.isArray(data9)){
if(data9.length > 3){
const err22 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0,schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data9.length < 3){
const err23 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0,schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
const len3 = data9.length;
if(len3 > 0){
let data10 = data9[0];
if(!((typeof data10 == "number") && (isFinite(data10)))){
const err24 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0+"/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(len3 > 1){
let data11 = data9[1];
if(!((typeof data11 == "number") && (isFinite(data11)))){
const err25 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0+"/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(len3 > 2){
let data12 = data9[2];
if(!((typeof data12 == "number") && (isFinite(data12)))){
const err26 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0+"/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
const len4 = data9.length;
if(!(len4 <= 3)){
const err27 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0,schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ/" + i0,schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
let i1 = data8.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data8[i1], data8[j0])){
const err29 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ",schemaPath:"#/properties/dismountCandidateOffsetsMetersXYZ/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err30 = {instancePath:instancePath+"/dismountCandidateOffsetsMetersXYZ",schemaPath:"#/properties/dismountCandidateOffsetsMetersXYZ/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
validate36.errors = vErrors;
return errors === 0;
}
validate36.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const formats0 = /^worldkit:\/\/collider-derivation-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/;
const formats2 = /^worldkit:\/\/capability\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/;
const formats4 = /^worldkit:\/\/physics-body-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/;
const formats6 = /^worldkit:\/\/locomotion-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/;

function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="worldkit://schema/subject-definition@1" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs2 = errors;
let valid1 = true;
const _errs3 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.visualBinding !== undefined){
let data0 = data.visualBinding;
const _errs4 = errors;
if(errors === _errs4){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing0;
if((data0.mode === undefined) && (missing0 = "mode")){
const err0 = {};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
if(data0.mode !== undefined){
if("rigged" !== data0.mode){
const err1 = {};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
}
else {
const err2 = {};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
}
var _valid0 = _errs3 === errors;
errors = _errs2;
if(vErrors !== null){
if(_errs2){
vErrors.length = _errs2;
}
else {
vErrors = null;
}
}
if(_valid0){
const _errs7 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.visualParts !== undefined){
let data2 = data.visualParts;
if(Array.isArray(data2)){
const _errs10 = errors;
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
const _errs11 = errors;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.kind === undefined){
const err3 = {instancePath:instancePath+"/visualParts/" + i0,schemaPath:"#/allOf/0/then/properties/visualParts/contains/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data3.kind !== undefined){
if("asset" !== data3.kind){
const err4 = {instancePath:instancePath+"/visualParts/" + i0+"/kind",schemaPath:"#/allOf/0/then/properties/visualParts/contains/properties/kind/const",keyword:"const",params:{allowedValue: "asset"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath:instancePath+"/visualParts/" + i0,schemaPath:"#/allOf/0/then/properties/visualParts/contains/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var valid5 = _errs11 === errors;
if(valid5){
break;
}
}
if(!valid5){
const err6 = {instancePath:instancePath+"/visualParts",schemaPath:"#/allOf/0/then/properties/visualParts/contains",keyword:"contains",params:{minContains: 1},message:"must contain at least 1 valid item(s)"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
else {
errors = _errs10;
if(vErrors !== null){
if(_errs10){
vErrors.length = _errs10;
}
else {
vErrors = null;
}
}
}
}
else {
const err7 = {instancePath:instancePath+"/visualParts",schemaPath:"#/allOf/0/then/properties/visualParts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
var _valid0 = _errs7 === errors;
valid1 = _valid0;
if(valid1){
var props0 = {};
props0.visualParts = true;
props0.visualBinding = true;
}
}
if(!valid1){
const err8 = {instancePath,schemaPath:"#/allOf/0/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.version === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.kind === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.authoringAvailability === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "authoringAvailability"},message:"must have required property '"+"authoringAvailability"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.category === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "category"},message:"must have required property '"+"category"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.bodyTopology === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bodyTopology"},message:"must have required property '"+"bodyTopology"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.semanticClassId === undefined){
const err15 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semanticClassId"},message:"must have required property '"+"semanticClassId"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.coordinateConvention === undefined){
const err16 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coordinateConvention"},message:"must have required property '"+"coordinateConvention"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.visualParts === undefined){
const err17 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "visualParts"},message:"must have required property '"+"visualParts"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data.visualBinding === undefined){
const err18 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "visualBinding"},message:"must have required property '"+"visualBinding"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data.sockets === undefined){
const err19 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sockets"},message:"must have required property '"+"sockets"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data.mountSlots === undefined){
const err20 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mountSlots"},message:"must have required property '"+"mountSlots"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data.colliderPolicy === undefined){
const err21 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "colliderPolicy"},message:"must have required property '"+"colliderPolicy"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data.capabilityRefs === undefined){
const err22 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "capabilityRefs"},message:"must have required property '"+"capabilityRefs"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data.profiles === undefined){
const err23 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "profiles"},message:"must have required property '"+"profiles"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.relationshipCapabilityRefs === undefined){
const err24 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "relationshipCapabilityRefs"},message:"must have required property '"+"relationshipCapabilityRefs"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data.actionOrPoseSetRef === undefined){
const err25 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "actionOrPoseSetRef"},message:"must have required property '"+"actionOrPoseSetRef"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.renderBindingProfileRef === undefined){
const err26 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "renderBindingProfileRef"},message:"must have required property '"+"renderBindingProfileRef"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data.allowedOverridePaths === undefined){
const err27 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "allowedOverridePaths"},message:"must have required property '"+"allowedOverridePaths"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data.aiMetadata === undefined){
const err28 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "aiMetadata"},message:"must have required property '"+"aiMetadata"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema31.properties, key0))){
const err29 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.id !== undefined){
let data5 = data.id;
if(typeof data5 === "string"){
if(!pattern4.test(data5)){
const err30 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.version !== undefined){
if(1 !== data.version){
const err32 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.kind !== undefined){
if("subject-definition" !== data.kind){
const err33 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "subject-definition"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.authoringAvailability !== undefined){
let data8 = data.authoringAvailability;
if(!(((data8 === "recommended") || (data8 === "advanced")) || (data8 === "experimental"))){
const err34 = {instancePath:instancePath+"/authoringAvailability",schemaPath:"#/properties/authoringAvailability/enum",keyword:"enum",params:{allowedValues: schema31.properties.authoringAvailability.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.category !== undefined){
let data9 = data.category;
if(!(((data9 === "human") || (data9 === "animal")) || (data9 === "custom"))){
const err35 = {instancePath:instancePath+"/category",schemaPath:"#/properties/category/enum",keyword:"enum",params:{allowedValues: schema31.properties.category.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.bodyTopology !== undefined){
let data10 = data.bodyTopology;
if(!(((data10 === "biped") || (data10 === "quadruped")) || (data10 === "custom"))){
const err36 = {instancePath:instancePath+"/bodyTopology",schemaPath:"#/properties/bodyTopology/enum",keyword:"enum",params:{allowedValues: schema31.properties.bodyTopology.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data.semanticClassId !== undefined){
let data11 = data.semanticClassId;
if(typeof data11 === "string"){
if(func2(data11) > 128){
const err37 = {instancePath:instancePath+"/semanticClassId",schemaPath:"#/$defs/nonEmptyString/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(func2(data11) < 1){
const err38 = {instancePath:instancePath+"/semanticClassId",schemaPath:"#/$defs/nonEmptyString/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/semanticClassId",schemaPath:"#/$defs/nonEmptyString/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.coordinateConvention !== undefined){
let data12 = data.coordinateConvention;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if(data12.forwardAxis === undefined){
const err40 = {instancePath:instancePath+"/coordinateConvention",schemaPath:"#/properties/coordinateConvention/required",keyword:"required",params:{missingProperty: "forwardAxis"},message:"must have required property '"+"forwardAxis"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(data12.upAxis === undefined){
const err41 = {instancePath:instancePath+"/coordinateConvention",schemaPath:"#/properties/coordinateConvention/required",keyword:"required",params:{missingProperty: "upAxis"},message:"must have required property '"+"upAxis"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data12.metersPerUnit === undefined){
const err42 = {instancePath:instancePath+"/coordinateConvention",schemaPath:"#/properties/coordinateConvention/required",keyword:"required",params:{missingProperty: "metersPerUnit"},message:"must have required property '"+"metersPerUnit"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data12.pivot === undefined){
const err43 = {instancePath:instancePath+"/coordinateConvention",schemaPath:"#/properties/coordinateConvention/required",keyword:"required",params:{missingProperty: "pivot"},message:"must have required property '"+"pivot"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
for(const key1 in data12){
if(!((((key1 === "forwardAxis") || (key1 === "upAxis")) || (key1 === "metersPerUnit")) || (key1 === "pivot"))){
const err44 = {instancePath:instancePath+"/coordinateConvention",schemaPath:"#/properties/coordinateConvention/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data12.forwardAxis !== undefined){
if("-Z" !== data12.forwardAxis){
const err45 = {instancePath:instancePath+"/coordinateConvention/forwardAxis",schemaPath:"#/properties/coordinateConvention/properties/forwardAxis/const",keyword:"const",params:{allowedValue: "-Z"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data12.upAxis !== undefined){
if("+Y" !== data12.upAxis){
const err46 = {instancePath:instancePath+"/coordinateConvention/upAxis",schemaPath:"#/properties/coordinateConvention/properties/upAxis/const",keyword:"const",params:{allowedValue: "+Y"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data12.metersPerUnit !== undefined){
if(1 !== data12.metersPerUnit){
const err47 = {instancePath:instancePath+"/coordinateConvention/metersPerUnit",schemaPath:"#/properties/coordinateConvention/properties/metersPerUnit/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data12.pivot !== undefined){
if("support-center" !== data12.pivot){
const err48 = {instancePath:instancePath+"/coordinateConvention/pivot",schemaPath:"#/properties/coordinateConvention/properties/pivot/const",keyword:"const",params:{allowedValue: "support-center"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
}
else {
const err49 = {instancePath:instancePath+"/coordinateConvention",schemaPath:"#/properties/coordinateConvention/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.visualParts !== undefined){
let data17 = data.visualParts;
if(Array.isArray(data17)){
if(data17.length > 128){
const err50 = {instancePath:instancePath+"/visualParts",schemaPath:"#/properties/visualParts/maxItems",keyword:"maxItems",params:{limit: 128},message:"must NOT have more than 128 items"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(data17.length < 1){
const err51 = {instancePath:instancePath+"/visualParts",schemaPath:"#/properties/visualParts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
const len1 = data17.length;
for(let i1=0; i1<len1; i1++){
if(!(validate21(data17[i1], {instancePath:instancePath+"/visualParts/" + i1,parentData:data17,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
}
else {
const err52 = {instancePath:instancePath+"/visualParts",schemaPath:"#/properties/visualParts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data.visualBinding !== undefined){
let data19 = data.visualBinding;
const _errs38 = errors;
let valid14 = false;
let passing0 = null;
const _errs39 = errors;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.mode === undefined){
const err53 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf/0/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
for(const key2 in data19){
if(!(key2 === "mode")){
const err54 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data19.mode !== undefined){
if("static" !== data19.mode){
const err55 = {instancePath:instancePath+"/visualBinding/mode",schemaPath:"#/$defs/visualBinding/oneOf/0/properties/mode/const",keyword:"const",params:{allowedValue: "static"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
}
else {
const err56 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
var _valid1 = _errs39 === errors;
if(_valid1){
valid14 = true;
passing0 = 0;
var props2 = true;
}
const _errs43 = errors;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.mode === undefined){
const err57 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data19.rigProfileRef === undefined){
const err58 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "rigProfileRef"},message:"must have required property '"+"rigProfileRef"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data19.animationSetRef === undefined){
const err59 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "animationSetRef"},message:"must have required property '"+"animationSetRef"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
for(const key3 in data19){
if(!(((key3 === "mode") || (key3 === "rigProfileRef")) || (key3 === "animationSetRef"))){
const err60 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data19.mode !== undefined){
if("rigged" !== data19.mode){
const err61 = {instancePath:instancePath+"/visualBinding/mode",schemaPath:"#/$defs/visualBinding/oneOf/1/properties/mode/const",keyword:"const",params:{allowedValue: "rigged"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data19.rigProfileRef !== undefined){
let data22 = data19.rigProfileRef;
if(typeof data22 === "string"){
if(!pattern10.test(data22)){
const err62 = {instancePath:instancePath+"/visualBinding/rigProfileRef",schemaPath:"#/$defs/visualBinding/oneOf/1/properties/rigProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
else {
const err63 = {instancePath:instancePath+"/visualBinding/rigProfileRef",schemaPath:"#/$defs/visualBinding/oneOf/1/properties/rigProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data19.animationSetRef !== undefined){
let data23 = data19.animationSetRef;
if(typeof data23 === "string"){
if(!pattern11.test(data23)){
const err64 = {instancePath:instancePath+"/visualBinding/animationSetRef",schemaPath:"#/$defs/visualBinding/oneOf/1/properties/animationSetRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
else {
const err65 = {instancePath:instancePath+"/visualBinding/animationSetRef",schemaPath:"#/$defs/visualBinding/oneOf/1/properties/animationSetRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
}
else {
const err66 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
var _valid1 = _errs43 === errors;
if(_valid1 && valid14){
valid14 = false;
passing0 = [passing0, 1];
}
else {
if(_valid1){
valid14 = true;
passing0 = 1;
if(props2 !== true){
props2 = true;
}
}
}
if(!valid14){
const err67 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/$defs/visualBinding/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
else {
errors = _errs38;
if(vErrors !== null){
if(_errs38){
vErrors.length = _errs38;
}
else {
vErrors = null;
}
}
}
}
if(data.sockets !== undefined){
let data24 = data.sockets;
if(Array.isArray(data24)){
if(data24.length > 64){
const err68 = {instancePath:instancePath+"/sockets",schemaPath:"#/properties/sockets/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
const len2 = data24.length;
for(let i2=0; i2<len2; i2++){
if(!(validate32(data24[i2], {instancePath:instancePath+"/sockets/" + i2,parentData:data24,parentDataProperty:i2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
errors = vErrors.length;
}
}
}
else {
const err69 = {instancePath:instancePath+"/sockets",schemaPath:"#/properties/sockets/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data.mountSlots !== undefined){
let data26 = data.mountSlots;
if(Array.isArray(data26)){
if(data26.length > 16){
const err70 = {instancePath:instancePath+"/mountSlots",schemaPath:"#/properties/mountSlots/maxItems",keyword:"maxItems",params:{limit: 16},message:"must NOT have more than 16 items"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
const len3 = data26.length;
for(let i3=0; i3<len3; i3++){
if(!(validate36(data26[i3], {instancePath:instancePath+"/mountSlots/" + i3,parentData:data26,parentDataProperty:i3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
}
}
else {
const err71 = {instancePath:instancePath+"/mountSlots",schemaPath:"#/properties/mountSlots/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data.colliderPolicy !== undefined){
let data28 = data.colliderPolicy;
const _errs59 = errors;
let valid22 = false;
let passing1 = null;
const _errs60 = errors;
if(data28 && typeof data28 == "object" && !Array.isArray(data28)){
if(data28.kind === undefined){
const err72 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if(data28.colliderDerivationProfileRef === undefined){
const err73 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf/0/required",keyword:"required",params:{missingProperty: "colliderDerivationProfileRef"},message:"must have required property '"+"colliderDerivationProfileRef"+"'"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
for(const key4 in data28){
if(!((key4 === "kind") || (key4 === "colliderDerivationProfileRef"))){
const err74 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data28.kind !== undefined){
if("derive" !== data28.kind){
const err75 = {instancePath:instancePath+"/colliderPolicy/kind",schemaPath:"#/$defs/colliderPolicy/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "derive"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
if(data28.colliderDerivationProfileRef !== undefined){
let data30 = data28.colliderDerivationProfileRef;
if(typeof data30 === "string"){
if(!(formats0.test(data30))){
const err76 = {instancePath:instancePath+"/colliderPolicy/colliderDerivationProfileRef",schemaPath:"#/$defs/colliderPolicy/oneOf/0/properties/colliderDerivationProfileRef/format",keyword:"format",params:{format: "collider-derivation-profile-ref"},message:"must match format \""+"collider-derivation-profile-ref"+"\""};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
else {
const err77 = {instancePath:instancePath+"/colliderPolicy/colliderDerivationProfileRef",schemaPath:"#/$defs/colliderPolicy/oneOf/0/properties/colliderDerivationProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
}
else {
const err78 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
var _valid2 = _errs60 === errors;
if(_valid2){
valid22 = true;
passing1 = 0;
var props4 = true;
}
const _errs66 = errors;
if(data28 && typeof data28 == "object" && !Array.isArray(data28)){
if(data28.kind === undefined){
const err79 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(data28.colliderProfileRef === undefined){
const err80 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf/1/required",keyword:"required",params:{missingProperty: "colliderProfileRef"},message:"must have required property '"+"colliderProfileRef"+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
for(const key5 in data28){
if(!((key5 === "kind") || (key5 === "colliderProfileRef"))){
const err81 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data28.kind !== undefined){
if("profile" !== data28.kind){
const err82 = {instancePath:instancePath+"/colliderPolicy/kind",schemaPath:"#/$defs/colliderPolicy/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "profile"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
if(data28.colliderProfileRef !== undefined){
let data32 = data28.colliderProfileRef;
if(typeof data32 === "string"){
if(!pattern18.test(data32)){
const err83 = {instancePath:instancePath+"/colliderPolicy/colliderProfileRef",schemaPath:"#/$defs/colliderPolicy/oneOf/1/properties/colliderProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
else {
const err84 = {instancePath:instancePath+"/colliderPolicy/colliderProfileRef",schemaPath:"#/$defs/colliderPolicy/oneOf/1/properties/colliderProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
}
else {
const err85 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
var _valid2 = _errs66 === errors;
if(_valid2 && valid22){
valid22 = false;
passing1 = [passing1, 1];
}
else {
if(_valid2){
valid22 = true;
passing1 = 1;
if(props4 !== true){
props4 = true;
}
}
}
if(!valid22){
const err86 = {instancePath:instancePath+"/colliderPolicy",schemaPath:"#/$defs/colliderPolicy/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
else {
errors = _errs59;
if(vErrors !== null){
if(_errs59){
vErrors.length = _errs59;
}
else {
vErrors = null;
}
}
}
}
if(data.capabilityRefs !== undefined){
let data33 = data.capabilityRefs;
if(Array.isArray(data33)){
if(data33.length > 16){
const err87 = {instancePath:instancePath+"/capabilityRefs",schemaPath:"#/properties/capabilityRefs/maxItems",keyword:"maxItems",params:{limit: 16},message:"must NOT have more than 16 items"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
if(data33.length < 1){
const err88 = {instancePath:instancePath+"/capabilityRefs",schemaPath:"#/properties/capabilityRefs/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
const len4 = data33.length;
for(let i4=0; i4<len4; i4++){
let data34 = data33[i4];
if(typeof data34 === "string"){
if(!(formats2.test(data34))){
const err89 = {instancePath:instancePath+"/capabilityRefs/" + i4,schemaPath:"#/properties/capabilityRefs/items/format",keyword:"format",params:{format: "capability-ref"},message:"must match format \""+"capability-ref"+"\""};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
else {
const err90 = {instancePath:instancePath+"/capabilityRefs/" + i4,schemaPath:"#/properties/capabilityRefs/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
let i5 = data33.length;
let j0;
if(i5 > 1){
const indices0 = {};
for(;i5--;){
let item0 = data33[i5];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err91 = {instancePath:instancePath+"/capabilityRefs",schemaPath:"#/properties/capabilityRefs/uniqueItems",keyword:"uniqueItems",params:{i: i5, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i5+" are identical)"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
break;
}
indices0[item0] = i5;
}
}
}
else {
const err92 = {instancePath:instancePath+"/capabilityRefs",schemaPath:"#/properties/capabilityRefs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data.profiles !== undefined){
let data35 = data.profiles;
if(data35 && typeof data35 == "object" && !Array.isArray(data35)){
if(data35.physicsBodyProfileRef === undefined){
const err93 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "physicsBodyProfileRef"},message:"must have required property '"+"physicsBodyProfileRef"+"'"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
if(data35.locomotionProfileRef === undefined){
const err94 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "locomotionProfileRef"},message:"must have required property '"+"locomotionProfileRef"+"'"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(data35.controlFeelProfileRef === undefined){
const err95 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "controlFeelProfileRef"},message:"must have required property '"+"controlFeelProfileRef"+"'"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
if(data35.allowedControlFeelProfileRefs === undefined){
const err96 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "allowedControlFeelProfileRefs"},message:"must have required property '"+"allowedControlFeelProfileRefs"+"'"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
if(data35.motion === undefined){
const err97 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "motion"},message:"must have required property '"+"motion"+"'"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
if(data35.controlProfileRef === undefined){
const err98 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "controlProfileRef"},message:"must have required property '"+"controlProfileRef"+"'"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
if(data35.cameraContextProfileRef === undefined){
const err99 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "cameraContextProfileRef"},message:"must have required property '"+"cameraContextProfileRef"+"'"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if(data35.mediumProfileRef === undefined){
const err100 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "mediumProfileRef"},message:"must have required property '"+"mediumProfileRef"+"'"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
if(data35.harnessProfileRef === undefined){
const err101 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/required",keyword:"required",params:{missingProperty: "harnessProfileRef"},message:"must have required property '"+"harnessProfileRef"+"'"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
for(const key6 in data35){
if(!(func1.call(schema31.properties.profiles.properties, key6))){
const err102 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
if(data35.physicsBodyProfileRef !== undefined){
let data36 = data35.physicsBodyProfileRef;
if(typeof data36 === "string"){
if(!(formats4.test(data36))){
const err103 = {instancePath:instancePath+"/profiles/physicsBodyProfileRef",schemaPath:"#/properties/profiles/properties/physicsBodyProfileRef/format",keyword:"format",params:{format: "physics-body-profile-ref"},message:"must match format \""+"physics-body-profile-ref"+"\""};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
else {
const err104 = {instancePath:instancePath+"/profiles/physicsBodyProfileRef",schemaPath:"#/properties/profiles/properties/physicsBodyProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
if(data35.locomotionProfileRef !== undefined){
let data37 = data35.locomotionProfileRef;
if(typeof data37 === "string"){
if(!(formats6.test(data37))){
const err105 = {instancePath:instancePath+"/profiles/locomotionProfileRef",schemaPath:"#/properties/profiles/properties/locomotionProfileRef/format",keyword:"format",params:{format: "locomotion-profile-ref"},message:"must match format \""+"locomotion-profile-ref"+"\""};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
else {
const err106 = {instancePath:instancePath+"/profiles/locomotionProfileRef",schemaPath:"#/properties/profiles/properties/locomotionProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
}
if(data35.controlFeelProfileRef !== undefined){
let data38 = data35.controlFeelProfileRef;
if(typeof data38 === "string"){
if(!pattern19.test(data38)){
const err107 = {instancePath:instancePath+"/profiles/controlFeelProfileRef",schemaPath:"#/properties/profiles/properties/controlFeelProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
else {
const err108 = {instancePath:instancePath+"/profiles/controlFeelProfileRef",schemaPath:"#/properties/profiles/properties/controlFeelProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data35.allowedControlFeelProfileRefs !== undefined){
let data39 = data35.allowedControlFeelProfileRefs;
if(Array.isArray(data39)){
if(data39.length > 16){
const err109 = {instancePath:instancePath+"/profiles/allowedControlFeelProfileRefs",schemaPath:"#/properties/profiles/properties/allowedControlFeelProfileRefs/maxItems",keyword:"maxItems",params:{limit: 16},message:"must NOT have more than 16 items"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
if(data39.length < 1){
const err110 = {instancePath:instancePath+"/profiles/allowedControlFeelProfileRefs",schemaPath:"#/properties/profiles/properties/allowedControlFeelProfileRefs/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
const len5 = data39.length;
for(let i6=0; i6<len5; i6++){
let data40 = data39[i6];
if(typeof data40 === "string"){
if(!pattern19.test(data40)){
const err111 = {instancePath:instancePath+"/profiles/allowedControlFeelProfileRefs/" + i6,schemaPath:"#/properties/profiles/properties/allowedControlFeelProfileRefs/items/pattern",keyword:"pattern",params:{pattern: "^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://control-feel-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
else {
const err112 = {instancePath:instancePath+"/profiles/allowedControlFeelProfileRefs/" + i6,schemaPath:"#/properties/profiles/properties/allowedControlFeelProfileRefs/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
let i7 = data39.length;
let j1;
if(i7 > 1){
const indices1 = {};
for(;i7--;){
let item1 = data39[i7];
if(typeof item1 !== "string"){
continue;
}
if(typeof indices1[item1] == "number"){
j1 = indices1[item1];
const err113 = {instancePath:instancePath+"/profiles/allowedControlFeelProfileRefs",schemaPath:"#/properties/profiles/properties/allowedControlFeelProfileRefs/uniqueItems",keyword:"uniqueItems",params:{i: i7, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i7+" are identical)"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
break;
}
indices1[item1] = i7;
}
}
}
else {
const err114 = {instancePath:instancePath+"/profiles/allowedControlFeelProfileRefs",schemaPath:"#/properties/profiles/properties/allowedControlFeelProfileRefs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
if(data35.motion !== undefined){
let data41 = data35.motion;
if(data41 && typeof data41 == "object" && !Array.isArray(data41)){
if(data41.defaultMotionProfileRef === undefined){
const err115 = {instancePath:instancePath+"/profiles/motion",schemaPath:"#/properties/profiles/properties/motion/required",keyword:"required",params:{missingProperty: "defaultMotionProfileRef"},message:"must have required property '"+"defaultMotionProfileRef"+"'"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
if(data41.optionalMotionProfileRefs === undefined){
const err116 = {instancePath:instancePath+"/profiles/motion",schemaPath:"#/properties/profiles/properties/motion/required",keyword:"required",params:{missingProperty: "optionalMotionProfileRefs"},message:"must have required property '"+"optionalMotionProfileRefs"+"'"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
if(data41.fallbackMotionProfileRef === undefined){
const err117 = {instancePath:instancePath+"/profiles/motion",schemaPath:"#/properties/profiles/properties/motion/required",keyword:"required",params:{missingProperty: "fallbackMotionProfileRef"},message:"must have required property '"+"fallbackMotionProfileRef"+"'"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
for(const key7 in data41){
if(!(((key7 === "defaultMotionProfileRef") || (key7 === "optionalMotionProfileRefs")) || (key7 === "fallbackMotionProfileRef"))){
const err118 = {instancePath:instancePath+"/profiles/motion",schemaPath:"#/properties/profiles/properties/motion/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
if(data41.defaultMotionProfileRef !== undefined){
let data42 = data41.defaultMotionProfileRef;
if(typeof data42 === "string"){
if(!pattern21.test(data42)){
const err119 = {instancePath:instancePath+"/profiles/motion/defaultMotionProfileRef",schemaPath:"#/properties/profiles/properties/motion/properties/defaultMotionProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
else {
const err120 = {instancePath:instancePath+"/profiles/motion/defaultMotionProfileRef",schemaPath:"#/properties/profiles/properties/motion/properties/defaultMotionProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
}
if(data41.optionalMotionProfileRefs !== undefined){
let data43 = data41.optionalMotionProfileRefs;
if(Array.isArray(data43)){
if(data43.length > 16){
const err121 = {instancePath:instancePath+"/profiles/motion/optionalMotionProfileRefs",schemaPath:"#/properties/profiles/properties/motion/properties/optionalMotionProfileRefs/maxItems",keyword:"maxItems",params:{limit: 16},message:"must NOT have more than 16 items"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
const len6 = data43.length;
for(let i8=0; i8<len6; i8++){
let data44 = data43[i8];
if(typeof data44 === "string"){
if(!pattern21.test(data44)){
const err122 = {instancePath:instancePath+"/profiles/motion/optionalMotionProfileRefs/" + i8,schemaPath:"#/properties/profiles/properties/motion/properties/optionalMotionProfileRefs/items/pattern",keyword:"pattern",params:{pattern: "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
else {
const err123 = {instancePath:instancePath+"/profiles/motion/optionalMotionProfileRefs/" + i8,schemaPath:"#/properties/profiles/properties/motion/properties/optionalMotionProfileRefs/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
let i9 = data43.length;
let j2;
if(i9 > 1){
const indices2 = {};
for(;i9--;){
let item2 = data43[i9];
if(typeof item2 !== "string"){
continue;
}
if(typeof indices2[item2] == "number"){
j2 = indices2[item2];
const err124 = {instancePath:instancePath+"/profiles/motion/optionalMotionProfileRefs",schemaPath:"#/properties/profiles/properties/motion/properties/optionalMotionProfileRefs/uniqueItems",keyword:"uniqueItems",params:{i: i9, j: j2},message:"must NOT have duplicate items (items ## "+j2+" and "+i9+" are identical)"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
break;
}
indices2[item2] = i9;
}
}
}
else {
const err125 = {instancePath:instancePath+"/profiles/motion/optionalMotionProfileRefs",schemaPath:"#/properties/profiles/properties/motion/properties/optionalMotionProfileRefs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
}
if(data41.fallbackMotionProfileRef !== undefined){
let data45 = data41.fallbackMotionProfileRef;
if(typeof data45 === "string"){
if(!pattern21.test(data45)){
const err126 = {instancePath:instancePath+"/profiles/motion/fallbackMotionProfileRef",schemaPath:"#/properties/profiles/properties/motion/properties/fallbackMotionProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://motion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
else {
const err127 = {instancePath:instancePath+"/profiles/motion/fallbackMotionProfileRef",schemaPath:"#/properties/profiles/properties/motion/properties/fallbackMotionProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
}
else {
const err128 = {instancePath:instancePath+"/profiles/motion",schemaPath:"#/properties/profiles/properties/motion/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
if(data35.controlProfileRef !== undefined){
let data46 = data35.controlProfileRef;
if(typeof data46 === "string"){
if(!pattern24.test(data46)){
const err129 = {instancePath:instancePath+"/profiles/controlProfileRef",schemaPath:"#/properties/profiles/properties/controlProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://control-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://control-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
else {
const err130 = {instancePath:instancePath+"/profiles/controlProfileRef",schemaPath:"#/properties/profiles/properties/controlProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
if(data35.cameraContextProfileRef !== undefined){
let data47 = data35.cameraContextProfileRef;
if(typeof data47 === "string"){
if(!pattern25.test(data47)){
const err131 = {instancePath:instancePath+"/profiles/cameraContextProfileRef",schemaPath:"#/properties/profiles/properties/cameraContextProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://camera-context/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://camera-context/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
}
else {
const err132 = {instancePath:instancePath+"/profiles/cameraContextProfileRef",schemaPath:"#/properties/profiles/properties/cameraContextProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
}
if(data35.mediumProfileRef !== undefined){
let data48 = data35.mediumProfileRef;
if(typeof data48 === "string"){
if(!pattern26.test(data48)){
const err133 = {instancePath:instancePath+"/profiles/mediumProfileRef",schemaPath:"#/properties/profiles/properties/mediumProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://medium-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://medium-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
else {
const err134 = {instancePath:instancePath+"/profiles/mediumProfileRef",schemaPath:"#/properties/profiles/properties/mediumProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
if(data35.harnessProfileRef !== undefined){
let data49 = data35.harnessProfileRef;
if(typeof data49 === "string"){
if(!pattern27.test(data49)){
const err135 = {instancePath:instancePath+"/profiles/harnessProfileRef",schemaPath:"#/properties/profiles/properties/harnessProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://harness-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://harness-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
}
else {
const err136 = {instancePath:instancePath+"/profiles/harnessProfileRef",schemaPath:"#/properties/profiles/properties/harnessProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
}
else {
const err137 = {instancePath:instancePath+"/profiles",schemaPath:"#/properties/profiles/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
if(data.relationshipCapabilityRefs !== undefined){
let data50 = data.relationshipCapabilityRefs;
if(Array.isArray(data50)){
if(data50.length > 16){
const err138 = {instancePath:instancePath+"/relationshipCapabilityRefs",schemaPath:"#/properties/relationshipCapabilityRefs/maxItems",keyword:"maxItems",params:{limit: 16},message:"must NOT have more than 16 items"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
const len7 = data50.length;
for(let i10=0; i10<len7; i10++){
let data51 = data50[i10];
if(typeof data51 === "string"){
if(!(formats2.test(data51))){
const err139 = {instancePath:instancePath+"/relationshipCapabilityRefs/" + i10,schemaPath:"#/properties/relationshipCapabilityRefs/items/format",keyword:"format",params:{format: "capability-ref"},message:"must match format \""+"capability-ref"+"\""};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
else {
const err140 = {instancePath:instancePath+"/relationshipCapabilityRefs/" + i10,schemaPath:"#/properties/relationshipCapabilityRefs/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
let i11 = data50.length;
let j3;
if(i11 > 1){
const indices3 = {};
for(;i11--;){
let item3 = data50[i11];
if(typeof item3 !== "string"){
continue;
}
if(typeof indices3[item3] == "number"){
j3 = indices3[item3];
const err141 = {instancePath:instancePath+"/relationshipCapabilityRefs",schemaPath:"#/properties/relationshipCapabilityRefs/uniqueItems",keyword:"uniqueItems",params:{i: i11, j: j3},message:"must NOT have duplicate items (items ## "+j3+" and "+i11+" are identical)"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
break;
}
indices3[item3] = i11;
}
}
}
else {
const err142 = {instancePath:instancePath+"/relationshipCapabilityRefs",schemaPath:"#/properties/relationshipCapabilityRefs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
}
if(data.actionOrPoseSetRef !== undefined){
let data52 = data.actionOrPoseSetRef;
if(typeof data52 === "string"){
if(!pattern28.test(data52)){
const err143 = {instancePath:instancePath+"/actionOrPoseSetRef",schemaPath:"#/properties/actionOrPoseSetRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://(?:animation-set|pose-set)/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://(?:animation-set|pose-set)/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
}
else {
const err144 = {instancePath:instancePath+"/actionOrPoseSetRef",schemaPath:"#/properties/actionOrPoseSetRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
}
if(data.renderBindingProfileRef !== undefined){
let data53 = data.renderBindingProfileRef;
if(typeof data53 === "string"){
if(!pattern29.test(data53)){
const err145 = {instancePath:instancePath+"/renderBindingProfileRef",schemaPath:"#/properties/renderBindingProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://render-binding/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://render-binding/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
}
else {
const err146 = {instancePath:instancePath+"/renderBindingProfileRef",schemaPath:"#/properties/renderBindingProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
}
if(data.allowedOverridePaths !== undefined){
let data54 = data.allowedOverridePaths;
if(Array.isArray(data54)){
if(data54.length > 3){
const err147 = {instancePath:instancePath+"/allowedOverridePaths",schemaPath:"#/properties/allowedOverridePaths/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
const len8 = data54.length;
for(let i12=0; i12<len8; i12++){
let data55 = data54[i12];
if(!(((data55 === "profiles.controlFeelProfileRef") || (data55 === "profiles.controlProfileRef")) || (data55 === "profiles.motion.defaultMotionProfileRef"))){
const err148 = {instancePath:instancePath+"/allowedOverridePaths/" + i12,schemaPath:"#/properties/allowedOverridePaths/items/enum",keyword:"enum",params:{allowedValues: schema31.properties.allowedOverridePaths.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
}
let i13 = data54.length;
let j4;
if(i13 > 1){
outer0:
for(;i13--;){
for(j4 = i13; j4--;){
if(func0(data54[i13], data54[j4])){
const err149 = {instancePath:instancePath+"/allowedOverridePaths",schemaPath:"#/properties/allowedOverridePaths/uniqueItems",keyword:"uniqueItems",params:{i: i13, j: j4},message:"must NOT have duplicate items (items ## "+j4+" and "+i13+" are identical)"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err150 = {instancePath:instancePath+"/allowedOverridePaths",schemaPath:"#/properties/allowedOverridePaths/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
}
if(data.aiMetadata !== undefined){
let data56 = data.aiMetadata;
if(data56 && typeof data56 == "object" && !Array.isArray(data56)){
if(data56.displayName === undefined){
const err151 = {instancePath:instancePath+"/aiMetadata",schemaPath:"#/properties/aiMetadata/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
if(data56.description === undefined){
const err152 = {instancePath:instancePath+"/aiMetadata",schemaPath:"#/properties/aiMetadata/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
if(data56.semanticTags === undefined){
const err153 = {instancePath:instancePath+"/aiMetadata",schemaPath:"#/properties/aiMetadata/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
for(const key8 in data56){
if(!(((key8 === "displayName") || (key8 === "description")) || (key8 === "semanticTags"))){
const err154 = {instancePath:instancePath+"/aiMetadata",schemaPath:"#/properties/aiMetadata/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
}
if(data56.displayName !== undefined){
let data57 = data56.displayName;
if(typeof data57 === "string"){
if(func2(data57) > 120){
const err155 = {instancePath:instancePath+"/aiMetadata/displayName",schemaPath:"#/properties/aiMetadata/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
if(func2(data57) < 1){
const err156 = {instancePath:instancePath+"/aiMetadata/displayName",schemaPath:"#/properties/aiMetadata/properties/displayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
}
else {
const err157 = {instancePath:instancePath+"/aiMetadata/displayName",schemaPath:"#/properties/aiMetadata/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
}
if(data56.description !== undefined){
let data58 = data56.description;
if(typeof data58 === "string"){
if(func2(data58) > 1000){
const err158 = {instancePath:instancePath+"/aiMetadata/description",schemaPath:"#/properties/aiMetadata/properties/description/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
if(func2(data58) < 1){
const err159 = {instancePath:instancePath+"/aiMetadata/description",schemaPath:"#/properties/aiMetadata/properties/description/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
}
else {
const err160 = {instancePath:instancePath+"/aiMetadata/description",schemaPath:"#/properties/aiMetadata/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
}
if(data56.semanticTags !== undefined){
let data59 = data56.semanticTags;
if(Array.isArray(data59)){
if(data59.length > 32){
const err161 = {instancePath:instancePath+"/aiMetadata/semanticTags",schemaPath:"#/$defs/semanticTags/maxItems",keyword:"maxItems",params:{limit: 32},message:"must NOT have more than 32 items"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
const len9 = data59.length;
for(let i14=0; i14<len9; i14++){
let data60 = data59[i14];
if(typeof data60 === "string"){
if(!pattern4.test(data60)){
const err162 = {instancePath:instancePath+"/aiMetadata/semanticTags/" + i14,schemaPath:"#/$defs/semanticTags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
}
else {
const err163 = {instancePath:instancePath+"/aiMetadata/semanticTags/" + i14,schemaPath:"#/$defs/semanticTags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
}
let i15 = data59.length;
let j5;
if(i15 > 1){
const indices4 = {};
for(;i15--;){
let item4 = data59[i15];
if(typeof item4 !== "string"){
continue;
}
if(typeof indices4[item4] == "number"){
j5 = indices4[item4];
const err164 = {instancePath:instancePath+"/aiMetadata/semanticTags",schemaPath:"#/$defs/semanticTags/uniqueItems",keyword:"uniqueItems",params:{i: i15, j: j5},message:"must NOT have duplicate items (items ## "+j5+" and "+i15+" are identical)"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
break;
}
indices4[item4] = i15;
}
}
}
else {
const err165 = {instancePath:instancePath+"/aiMetadata/semanticTags",schemaPath:"#/$defs/semanticTags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
}
}
else {
const err166 = {instancePath:instancePath+"/aiMetadata",schemaPath:"#/properties/aiMetadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
}
}
else {
const err167 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSubjectDesign = validate38;
const schema68 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"worldkit://schema/subject-design@1","oneOf":[{"type":"object","additionalProperties":false,"required":["kind","subjectDefinitionRef"],"properties":{"kind":{"const":"registered"},"subjectDefinitionRef":{"type":"string","pattern":"^worldkit://subject-definition/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"}}},{"type":"object","additionalProperties":false,"required":["kind","definition"],"properties":{"kind":{"const":"composed"},"definition":{"$ref":"#/$defs/composedDefinition"}}}],"$defs":{"composedDefinition":{"type":"object","additionalProperties":false,"required":["id","category","bodyTopology","semanticClassId","displayName","description","visualParts","visualBinding"],"properties":{"id":{"$ref":"worldkit://schema/subject-definition@1#/properties/id"},"category":{"$ref":"worldkit://schema/subject-definition@1#/properties/category"},"bodyTopology":{"$ref":"worldkit://schema/subject-definition@1#/properties/bodyTopology"},"semanticClassId":{"$ref":"worldkit://schema/subject-definition@1#/properties/semanticClassId"},"displayName":{"$ref":"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/displayName"},"description":{"$ref":"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/description"},"visualParts":{"type":"array","minItems":1,"maxItems":128,"items":{"oneOf":[{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualPart/oneOf/0"},{"$ref":"#/$defs/assetPart"}]}},"visualBinding":{"oneOf":[{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/0"},{"type":"object","additionalProperties":false,"required":["mode","rigProfileRef","animationSetRef","colliderProfileRef"],"properties":{"mode":{"const":"rigged"},"rigProfileRef":{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/1/properties/rigProfileRef"},"animationSetRef":{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/1/properties/animationSetRef"},"colliderProfileRef":{"$ref":"worldkit://schema/subject-definition@1#/$defs/colliderPolicy/oneOf/1/properties/colliderProfileRef"}}}]}},"allOf":[{"if":{"type":"object","properties":{"visualBinding":{"$ref":"worldkit://schema/subject-definition@1#/allOf/0/if/properties/visualBinding"}}},"then":{"type":"object","properties":{"visualParts":{"$ref":"worldkit://schema/subject-definition@1#/allOf/0/then/properties/visualParts"}}}}]},"assetPart":{"type":"object","additionalProperties":false,"required":["id","kind","subjectAssetRef","localTransform","semanticTags"],"properties":{"id":{"$ref":"worldkit://schema/subject-definition@1#/$defs/id"},"kind":{"const":"asset"},"subjectAssetRef":{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualPart/oneOf/1/properties/subjectAssetRef"},"localTransform":{"$ref":"worldkit://schema/subject-definition@1#/$defs/assetLocalTransform"},"semanticTags":{"$ref":"worldkit://schema/subject-definition@1#/$defs/semanticTags"}}}}};
const pattern31 = new RegExp("^worldkit://subject-definition/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$", "u");
const schema69 = {"type":"object","additionalProperties":false,"required":["id","category","bodyTopology","semanticClassId","displayName","description","visualParts","visualBinding"],"properties":{"id":{"$ref":"worldkit://schema/subject-definition@1#/properties/id"},"category":{"$ref":"worldkit://schema/subject-definition@1#/properties/category"},"bodyTopology":{"$ref":"worldkit://schema/subject-definition@1#/properties/bodyTopology"},"semanticClassId":{"$ref":"worldkit://schema/subject-definition@1#/properties/semanticClassId"},"displayName":{"$ref":"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/displayName"},"description":{"$ref":"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/description"},"visualParts":{"type":"array","minItems":1,"maxItems":128,"items":{"oneOf":[{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualPart/oneOf/0"},{"$ref":"#/$defs/assetPart"}]}},"visualBinding":{"oneOf":[{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/0"},{"type":"object","additionalProperties":false,"required":["mode","rigProfileRef","animationSetRef","colliderProfileRef"],"properties":{"mode":{"const":"rigged"},"rigProfileRef":{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/1/properties/rigProfileRef"},"animationSetRef":{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/1/properties/animationSetRef"},"colliderProfileRef":{"$ref":"worldkit://schema/subject-definition@1#/$defs/colliderPolicy/oneOf/1/properties/colliderProfileRef"}}}]}},"allOf":[{"if":{"type":"object","properties":{"visualBinding":{"$ref":"worldkit://schema/subject-definition@1#/allOf/0/if/properties/visualBinding"}}},"then":{"type":"object","properties":{"visualParts":{"$ref":"worldkit://schema/subject-definition@1#/allOf/0/then/properties/visualParts"}}}}]};
const schema70 = {"type":"object","required":["mode"],"properties":{"mode":{"const":"rigged"}}};
const schema71 = {"type":"array","contains":{"type":"object","required":["kind"],"properties":{"kind":{"const":"asset"}}},"minContains":1};
const schema73 = {"enum":["human","animal","custom"]};
const schema74 = {"enum":["biped","quadruped","custom"]};
const schema76 = {"type":"string","minLength":1,"maxLength":120};
const schema77 = {"type":"string","minLength":1,"maxLength":1000};
const schema88 = {"type":"object","additionalProperties":false,"required":["mode"],"properties":{"mode":{"const":"static"}}};
const schema89 = {"type":"string","pattern":"^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"};
const schema90 = {"type":"string","pattern":"^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"};
const schema91 = {"type":"string","pattern":"^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"};
const schema78 = {"type":"object","additionalProperties":false,"required":["id","kind","shape","localTransform","colliderContribution","semanticTags"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"const":"primitive"},"shape":{"$ref":"#/$defs/shape"},"localTransform":{"$ref":"#/$defs/localTransform"},"colliderContribution":{"enum":["include","exclude"]},"semanticTags":{"$ref":"#/$defs/semanticTags"}}};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate40.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.shape === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "shape"},message:"must have required property '"+"shape"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.localTransform === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "localTransform"},message:"must have required property '"+"localTransform"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.colliderContribution === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "colliderContribution"},message:"must have required property '"+"colliderContribution"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.semanticTags === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "kind")) || (key0 === "shape")) || (key0 === "localTransform")) || (key0 === "colliderContribution")) || (key0 === "semanticTags"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern4.test(data0)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
if("primitive" !== data.kind){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "primitive"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.shape !== undefined){
if(!(validate22(data.shape, {instancePath:instancePath+"/shape",parentData:data,parentDataProperty:"shape",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
}
if(data.localTransform !== undefined){
if(!(validate26(data.localTransform, {instancePath:instancePath+"/localTransform",parentData:data,parentDataProperty:"localTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
if(data.colliderContribution !== undefined){
let data4 = data.colliderContribution;
if(!((data4 === "include") || (data4 === "exclude"))){
const err10 = {instancePath:instancePath+"/colliderContribution",schemaPath:"#/properties/colliderContribution/enum",keyword:"enum",params:{allowedValues: schema78.properties.colliderContribution.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.semanticTags !== undefined){
let data5 = data.semanticTags;
if(Array.isArray(data5)){
if(data5.length > 32){
const err11 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/maxItems",keyword:"maxItems",params:{limit: 32},message:"must NOT have more than 32 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(!pattern4.test(data6)){
const err12 = {instancePath:instancePath+"/semanticTags/" + i0,schemaPath:"#/$defs/semanticTags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/semanticTags/" + i0,schemaPath:"#/$defs/semanticTags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
const indices0 = {};
for(;i1--;){
let item0 = data5[i1];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err14 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
break;
}
indices0[item0] = i1;
}
}
}
else {
const err15 = {instancePath:instancePath+"/semanticTags",schemaPath:"#/$defs/semanticTags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate40.errors = vErrors;
return errors === 0;
}
validate40.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema81 = {"type":"object","additionalProperties":false,"required":["id","kind","subjectAssetRef","localTransform","semanticTags"],"properties":{"id":{"$ref":"worldkit://schema/subject-definition@1#/$defs/id"},"kind":{"const":"asset"},"subjectAssetRef":{"$ref":"worldkit://schema/subject-definition@1#/$defs/visualPart/oneOf/1/properties/subjectAssetRef"},"localTransform":{"$ref":"worldkit://schema/subject-definition@1#/$defs/assetLocalTransform"},"semanticTags":{"$ref":"worldkit://schema/subject-definition@1#/$defs/semanticTags"}}};
const schema83 = {"type":"string","pattern":"^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"};

function validate45(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate45.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.positionMetersXYZ === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "positionMetersXYZ"},message:"must have required property '"+"positionMetersXYZ"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.scaleXYZ === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scaleXYZ"},message:"must have required property '"+"scaleXYZ"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "positionMetersXYZ") || (key0 === "rotationEulerRadiansXYZ")) || (key0 === "scaleXYZ"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.positionMetersXYZ !== undefined){
let data0 = data.positionMetersXYZ;
if(Array.isArray(data0)){
if(data0.length > 3){
const err3 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data0.length < 3){
const err4 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
const len0 = data0.length;
if(len0 > 0){
let data1 = data0[0];
if(!((typeof data1 == "number") && (isFinite(data1)))){
const err5 = {instancePath:instancePath+"/positionMetersXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(len0 > 1){
let data2 = data0[1];
if(!((typeof data2 == "number") && (isFinite(data2)))){
const err6 = {instancePath:instancePath+"/positionMetersXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(len0 > 2){
let data3 = data0[2];
if(!((typeof data3 == "number") && (isFinite(data3)))){
const err7 = {instancePath:instancePath+"/positionMetersXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
const len1 = data0.length;
if(!(len1 <= 3)){
const err8 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/positionMetersXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.rotationEulerRadiansXYZ !== undefined){
let data4 = data.rotationEulerRadiansXYZ;
if(Array.isArray(data4)){
if(data4.length > 3){
const err10 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data4.length < 3){
const err11 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len2 = data4.length;
if(len2 > 0){
let data5 = data4[0];
if(!((typeof data5 == "number") && (isFinite(data5)))){
const err12 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/0",schemaPath:"#/$defs/vec3/prefixItems/0/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(len2 > 1){
let data6 = data4[1];
if(!((typeof data6 == "number") && (isFinite(data6)))){
const err13 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/1",schemaPath:"#/$defs/vec3/prefixItems/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(len2 > 2){
let data7 = data4[2];
if(!((typeof data7 == "number") && (isFinite(data7)))){
const err14 = {instancePath:instancePath+"/rotationEulerRadiansXYZ/2",schemaPath:"#/$defs/vec3/prefixItems/2/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
const len3 = data4.length;
if(!(len3 <= 3)){
const err15 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/items",keyword:"items",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/rotationEulerRadiansXYZ",schemaPath:"#/$defs/vec3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.scaleXYZ !== undefined){
if(!(validate23(data.scaleXYZ, {instancePath:instancePath+"/scaleXYZ",parentData:data,parentDataProperty:"scaleXYZ",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate45.errors = vErrors;
return errors === 0;
}
validate45.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate44.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.subjectAssetRef === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subjectAssetRef"},message:"must have required property '"+"subjectAssetRef"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.localTransform === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "localTransform"},message:"must have required property '"+"localTransform"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.semanticTags === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semanticTags"},message:"must have required property '"+"semanticTags"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "kind")) || (key0 === "subjectAssetRef")) || (key0 === "localTransform")) || (key0 === "semanticTags"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern4.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"worldkit://schema/subject-definition@1#/$defs/id/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/id",schemaPath:"worldkit://schema/subject-definition@1#/$defs/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
if("asset" !== data.kind){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "asset"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.subjectAssetRef !== undefined){
let data2 = data.subjectAssetRef;
if(typeof data2 === "string"){
if(!pattern8.test(data2)){
const err9 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualPart/oneOf/1/properties/subjectAssetRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://subject-asset/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/subjectAssetRef",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualPart/oneOf/1/properties/subjectAssetRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.localTransform !== undefined){
if(!(validate45(data.localTransform, {instancePath:instancePath+"/localTransform",parentData:data,parentDataProperty:"localTransform",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
errors = vErrors.length;
}
}
if(data.semanticTags !== undefined){
let data4 = data.semanticTags;
if(Array.isArray(data4)){
if(data4.length > 32){
const err11 = {instancePath:instancePath+"/semanticTags",schemaPath:"worldkit://schema/subject-definition@1#/$defs/semanticTags/maxItems",keyword:"maxItems",params:{limit: 32},message:"must NOT have more than 32 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
let data5 = data4[i0];
if(typeof data5 === "string"){
if(!pattern4.test(data5)){
const err12 = {instancePath:instancePath+"/semanticTags/" + i0,schemaPath:"worldkit://schema/subject-definition@1#/$defs/semanticTags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/semanticTags/" + i0,schemaPath:"worldkit://schema/subject-definition@1#/$defs/semanticTags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
let i1 = data4.length;
let j0;
if(i1 > 1){
const indices0 = {};
for(;i1--;){
let item0 = data4[i1];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err14 = {instancePath:instancePath+"/semanticTags",schemaPath:"worldkit://schema/subject-definition@1#/$defs/semanticTags/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
break;
}
indices0[item0] = i1;
}
}
}
else {
const err15 = {instancePath:instancePath+"/semanticTags",schemaPath:"worldkit://schema/subject-definition@1#/$defs/semanticTags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate44.errors = vErrors;
return errors === 0;
}
validate44.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate39(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate39.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs2 = errors;
let valid1 = true;
const _errs3 = errors;
if(errors === _errs3){
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.visualBinding !== undefined){
let data0 = data.visualBinding;
const _errs6 = errors;
if(errors === _errs6){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing0;
if((data0.mode === undefined) && (missing0 = "mode")){
const err0 = {};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
if(data0.mode !== undefined){
if("rigged" !== data0.mode){
const err1 = {};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
}
else {
const err2 = {};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
}
else {
const err3 = {};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
var _valid0 = _errs3 === errors;
errors = _errs2;
if(vErrors !== null){
if(_errs2){
vErrors.length = _errs2;
}
else {
vErrors = null;
}
}
if(_valid0){
const _errs9 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.visualParts !== undefined){
let data2 = data.visualParts;
if(Array.isArray(data2)){
const _errs14 = errors;
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
const _errs15 = errors;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.kind === undefined){
const err4 = {instancePath:instancePath+"/visualParts/" + i0,schemaPath:"worldkit://schema/subject-definition@1#/allOf/0/then/properties/visualParts/contains/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data3.kind !== undefined){
if("asset" !== data3.kind){
const err5 = {instancePath:instancePath+"/visualParts/" + i0+"/kind",schemaPath:"worldkit://schema/subject-definition@1#/allOf/0/then/properties/visualParts/contains/properties/kind/const",keyword:"const",params:{allowedValue: "asset"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath:instancePath+"/visualParts/" + i0,schemaPath:"worldkit://schema/subject-definition@1#/allOf/0/then/properties/visualParts/contains/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var valid7 = _errs15 === errors;
if(valid7){
break;
}
}
if(!valid7){
const err7 = {instancePath:instancePath+"/visualParts",schemaPath:"worldkit://schema/subject-definition@1#/allOf/0/then/properties/visualParts/contains",keyword:"contains",params:{minContains: 1},message:"must contain at least 1 valid item(s)"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
else {
errors = _errs14;
if(vErrors !== null){
if(_errs14){
vErrors.length = _errs14;
}
else {
vErrors = null;
}
}
}
}
else {
const err8 = {instancePath:instancePath+"/visualParts",schemaPath:"worldkit://schema/subject-definition@1#/allOf/0/then/properties/visualParts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/allOf/0/then/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid1 = _valid0;
if(valid1){
var props0 = {};
props0.visualParts = true;
props0.visualBinding = true;
}
}
if(!valid1){
const err10 = {instancePath,schemaPath:"#/allOf/0/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.category === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "category"},message:"must have required property '"+"category"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.bodyTopology === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bodyTopology"},message:"must have required property '"+"bodyTopology"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.semanticClassId === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semanticClassId"},message:"must have required property '"+"semanticClassId"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.displayName === undefined){
const err15 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.description === undefined){
const err16 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.visualParts === undefined){
const err17 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "visualParts"},message:"must have required property '"+"visualParts"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data.visualBinding === undefined){
const err18 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "visualBinding"},message:"must have required property '"+"visualBinding"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "id") || (key0 === "category")) || (key0 === "bodyTopology")) || (key0 === "semanticClassId")) || (key0 === "displayName")) || (key0 === "description")) || (key0 === "visualParts")) || (key0 === "visualBinding"))){
const err19 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.id !== undefined){
let data5 = data.id;
if(typeof data5 === "string"){
if(!pattern4.test(data5)){
const err20 = {instancePath:instancePath+"/id",schemaPath:"worldkit://schema/subject-definition@1#/properties/id/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9.-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9.-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/id",schemaPath:"worldkit://schema/subject-definition@1#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.category !== undefined){
let data6 = data.category;
if(!(((data6 === "human") || (data6 === "animal")) || (data6 === "custom"))){
const err22 = {instancePath:instancePath+"/category",schemaPath:"worldkit://schema/subject-definition@1#/properties/category/enum",keyword:"enum",params:{allowedValues: schema73.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.bodyTopology !== undefined){
let data7 = data.bodyTopology;
if(!(((data7 === "biped") || (data7 === "quadruped")) || (data7 === "custom"))){
const err23 = {instancePath:instancePath+"/bodyTopology",schemaPath:"worldkit://schema/subject-definition@1#/properties/bodyTopology/enum",keyword:"enum",params:{allowedValues: schema74.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.semanticClassId !== undefined){
let data8 = data.semanticClassId;
if(typeof data8 === "string"){
if(func2(data8) > 128){
const err24 = {instancePath:instancePath+"/semanticClassId",schemaPath:"worldkit://schema/subject-definition@1#/properties/semanticClassId/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(func2(data8) < 1){
const err25 = {instancePath:instancePath+"/semanticClassId",schemaPath:"worldkit://schema/subject-definition@1#/properties/semanticClassId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/semanticClassId",schemaPath:"worldkit://schema/subject-definition@1#/properties/semanticClassId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.displayName !== undefined){
let data9 = data.displayName;
if(typeof data9 === "string"){
if(func2(data9) > 120){
const err27 = {instancePath:instancePath+"/displayName",schemaPath:"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(func2(data9) < 1){
const err28 = {instancePath:instancePath+"/displayName",schemaPath:"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/displayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/displayName",schemaPath:"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.description !== undefined){
let data10 = data.description;
if(typeof data10 === "string"){
if(func2(data10) > 1000){
const err30 = {instancePath:instancePath+"/description",schemaPath:"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/description/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(func2(data10) < 1){
const err31 = {instancePath:instancePath+"/description",schemaPath:"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/description/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/description",schemaPath:"worldkit://schema/subject-definition@1#/properties/aiMetadata/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.visualParts !== undefined){
let data11 = data.visualParts;
if(Array.isArray(data11)){
if(data11.length > 128){
const err33 = {instancePath:instancePath+"/visualParts",schemaPath:"#/properties/visualParts/maxItems",keyword:"maxItems",params:{limit: 128},message:"must NOT have more than 128 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(data11.length < 1){
const err34 = {instancePath:instancePath+"/visualParts",schemaPath:"#/properties/visualParts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
const len1 = data11.length;
for(let i1=0; i1<len1; i1++){
let data12 = data11[i1];
const _errs38 = errors;
let valid18 = false;
let passing0 = null;
const _errs39 = errors;
if(!(validate40(data12, {instancePath:instancePath+"/visualParts/" + i1,parentData:data11,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
var _valid1 = _errs39 === errors;
if(_valid1){
valid18 = true;
passing0 = 0;
var props1 = true;
}
const _errs40 = errors;
if(!(validate44(data12, {instancePath:instancePath+"/visualParts/" + i1,parentData:data11,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
errors = vErrors.length;
}
var _valid1 = _errs40 === errors;
if(_valid1 && valid18){
valid18 = false;
passing0 = [passing0, 1];
}
else {
if(_valid1){
valid18 = true;
passing0 = 1;
if(props1 !== true){
props1 = true;
}
}
}
if(!valid18){
const err35 = {instancePath:instancePath+"/visualParts/" + i1,schemaPath:"#/properties/visualParts/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
errors = _errs38;
if(vErrors !== null){
if(_errs38){
vErrors.length = _errs38;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err36 = {instancePath:instancePath+"/visualParts",schemaPath:"#/properties/visualParts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data.visualBinding !== undefined){
let data13 = data.visualBinding;
const _errs42 = errors;
let valid19 = false;
let passing1 = null;
const _errs43 = errors;
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
if(data13.mode === undefined){
const err37 = {instancePath:instancePath+"/visualBinding",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/0/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
for(const key1 in data13){
if(!(key1 === "mode")){
const err38 = {instancePath:instancePath+"/visualBinding",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data13.mode !== undefined){
if("static" !== data13.mode){
const err39 = {instancePath:instancePath+"/visualBinding/mode",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/0/properties/mode/const",keyword:"const",params:{allowedValue: "static"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
}
else {
const err40 = {instancePath:instancePath+"/visualBinding",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var _valid2 = _errs43 === errors;
if(_valid2){
valid19 = true;
passing1 = 0;
var props2 = true;
}
const _errs48 = errors;
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
if(data13.mode === undefined){
const err41 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data13.rigProfileRef === undefined){
const err42 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "rigProfileRef"},message:"must have required property '"+"rigProfileRef"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data13.animationSetRef === undefined){
const err43 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "animationSetRef"},message:"must have required property '"+"animationSetRef"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data13.colliderProfileRef === undefined){
const err44 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/required",keyword:"required",params:{missingProperty: "colliderProfileRef"},message:"must have required property '"+"colliderProfileRef"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
for(const key2 in data13){
if(!((((key2 === "mode") || (key2 === "rigProfileRef")) || (key2 === "animationSetRef")) || (key2 === "colliderProfileRef"))){
const err45 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data13.mode !== undefined){
if("rigged" !== data13.mode){
const err46 = {instancePath:instancePath+"/visualBinding/mode",schemaPath:"#/properties/visualBinding/oneOf/1/properties/mode/const",keyword:"const",params:{allowedValue: "rigged"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data13.rigProfileRef !== undefined){
let data16 = data13.rigProfileRef;
if(typeof data16 === "string"){
if(!pattern10.test(data16)){
const err47 = {instancePath:instancePath+"/visualBinding/rigProfileRef",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/1/properties/rigProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://rig-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
else {
const err48 = {instancePath:instancePath+"/visualBinding/rigProfileRef",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/1/properties/rigProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data13.animationSetRef !== undefined){
let data17 = data13.animationSetRef;
if(typeof data17 === "string"){
if(!pattern11.test(data17)){
const err49 = {instancePath:instancePath+"/visualBinding/animationSetRef",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/1/properties/animationSetRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://animation-set/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
else {
const err50 = {instancePath:instancePath+"/visualBinding/animationSetRef",schemaPath:"worldkit://schema/subject-definition@1#/$defs/visualBinding/oneOf/1/properties/animationSetRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data13.colliderProfileRef !== undefined){
let data18 = data13.colliderProfileRef;
if(typeof data18 === "string"){
if(!pattern18.test(data18)){
const err51 = {instancePath:instancePath+"/visualBinding/colliderProfileRef",schemaPath:"worldkit://schema/subject-definition@1#/$defs/colliderPolicy/oneOf/1/properties/colliderProfileRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://collider-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
else {
const err52 = {instancePath:instancePath+"/visualBinding/colliderProfileRef",schemaPath:"worldkit://schema/subject-definition@1#/$defs/colliderPolicy/oneOf/1/properties/colliderProfileRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
}
else {
const err53 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var _valid2 = _errs48 === errors;
if(_valid2 && valid19){
valid19 = false;
passing1 = [passing1, 1];
}
else {
if(_valid2){
valid19 = true;
passing1 = 1;
if(props2 !== true){
props2 = true;
}
}
}
if(!valid19){
const err54 = {instancePath:instancePath+"/visualBinding",schemaPath:"#/properties/visualBinding/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
else {
errors = _errs42;
if(vErrors !== null){
if(_errs42){
vErrors.length = _errs42;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err55 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
validate39.errors = vErrors;
return errors === 0;
}
validate39.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="worldkit://schema/subject-design@1" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.subjectDefinitionRef === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "subjectDefinitionRef"},message:"must have required property '"+"subjectDefinitionRef"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "subjectDefinitionRef"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
if("registered" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "registered"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.subjectDefinitionRef !== undefined){
let data1 = data.subjectDefinitionRef;
if(typeof data1 === "string"){
if(!pattern31.test(data1)){
const err4 = {instancePath:instancePath+"/subjectDefinitionRef",schemaPath:"#/oneOf/0/properties/subjectDefinitionRef/pattern",keyword:"pattern",params:{pattern: "^worldkit://subject-definition/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"},message:"must match pattern \""+"^worldkit://subject-definition/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/subjectDefinitionRef",schemaPath:"#/oneOf/0/properties/subjectDefinitionRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs7 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err7 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.definition === undefined){
const err8 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "definition"},message:"must have required property '"+"definition"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key1 in data){
if(!((key1 === "kind") || (key1 === "definition"))){
const err9 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.kind !== undefined){
if("composed" !== data.kind){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "composed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.definition !== undefined){
if(!(validate39(data.definition, {instancePath:instancePath+"/definition",parentData:data,parentDataProperty:"definition",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
errors = vErrors.length;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs7 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err12 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate38.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate38.evaluated = {"dynamicProps":true,"dynamicItems":false};
