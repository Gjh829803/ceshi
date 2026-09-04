import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

class NodeFileReader {
  result = null
  onloadend = null
  onerror = null

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then((value) => {
        this.result = value
        this.onloadend?.({ target: this })
      })
      .catch((error) => this.onerror?.(error))
  }

  readAsDataURL(blob) {
    blob.arrayBuffer()
      .then((value) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(value).toString('base64')}`
        this.onloadend?.({ target: this })
      })
      .catch((error) => this.onerror?.(error))
  }
}

globalThis.FileReader = NodeFileReader

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.54, metalness: 0.18, ...options })
}

function addMesh(parent, name, geometry, meshMaterial, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, meshMaterial)
  mesh.name = name
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  parent.add(mesh)
  return mesh
}

function createKart() {
  const root = new THREE.Group()
  root.name = 'STKKart'
  const body = new THREE.Group()
  body.name = 'Body'
  root.add(body)

  const orange = material('#ff9b3d', { roughness: 0.36, metalness: 0.34 })
  const blue = material('#45c8ff', { roughness: 0.24, metalness: 0.4, emissive: '#45c8ff', emissiveIntensity: 0.1 })
  const dark = material('#151d27', { roughness: 0.78 })
  const rubber = material('#11151c', { roughness: 0.92, metalness: 0 })
  const rim = material('#c6d5df', { roughness: 0.28, metalness: 0.85 })

  addMesh(body, 'MainBody', new THREE.BoxGeometry(1.48, 0.34, 1.9), orange, [0, 0.48, 0.12])
  addMesh(body, 'FrontCowling', new THREE.BoxGeometry(1.1, 0.25, 0.92), blue, [0, 0.56, -1.08])
  addMesh(body, 'RearBumper', new THREE.BoxGeometry(2.18, 0.14, 0.26), dark, [0, 0.34, 1.24])
  addMesh(body, 'FrontBumper', new THREE.BoxGeometry(1.95, 0.1, 0.2), blue, [0, 0.29, -1.46])
  addMesh(body, 'Seat', new THREE.BoxGeometry(0.78, 0.55, 0.66), dark, [0, 0.76, 0.36])

  const helmet = addMesh(body, 'DriverHelmet', new THREE.SphereGeometry(0.32, 20, 14), blue, [0, 1.18, 0.38])
  helmet.scale.set(0.9, 1, 0.94)
  const visor = addMesh(
    body,
    'DriverVisor',
    new THREE.SphereGeometry(0.28, 18, 10, 0, Math.PI),
    material('#70d9ff', { emissive: '#123a4b', emissiveIntensity: 0.7, roughness: 0.12 }),
    [0, 1.18, 0.16],
    [Math.PI / 2, 0, 0],
  )
  visor.scale.set(1, 1, 1)

  for (const side of [-1, 1]) {
    addMesh(
      body,
      side < 0 ? 'ExhaustLeft' : 'ExhaustRight',
      new THREE.CylinderGeometry(0.09, 0.12, 0.48, 10),
      dark,
      [side * 0.53, 0.49, 1.2],
      [Math.PI / 2, 0, 0],
    )
  }

  const wheelX = 1.1
  const wheelZ = 0.975
  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? 'Left' : 'Right'
      const axleName = front ? 'Front' : 'Rear'
      const pivot = new THREE.Group()
      pivot.name = `Wheel${axleName}${sideName}`
      pivot.position.set(side * wheelX, 0.36, front ? -wheelZ : wheelZ)
      root.add(pivot)
      addMesh(
        pivot,
        `Tire${axleName}${sideName}`,
        new THREE.CylinderGeometry(0.36, 0.36, 0.3, 18),
        rubber,
        [0, 0, 0],
        [0, 0, Math.PI / 2],
      )
      addMesh(
        pivot,
        `Rim${axleName}${sideName}`,
        new THREE.CylinderGeometry(0.1548, 0.1548, 0.312, 16),
        rim,
        [0, 0, 0],
        [0, 0, Math.PI / 2],
      )
    }
  }

  return root
}

function inventory(root) {
  let meshCount = 0
  let primitiveCount = 0
  let vertexCount = 0
  let triangleCount = 0
  const materials = new Set()
  root.traverse((object) => {
    if (!object.isMesh) return
    meshCount += 1
    primitiveCount += Array.isArray(object.material) ? object.material.length : 1
    const position = object.geometry.getAttribute('position')
    vertexCount += position?.count || 0
    triangleCount += object.geometry.index
      ? object.geometry.index.count / 3
      : (position?.count || 0) / 3
    const list = Array.isArray(object.material) ? object.material : [object.material]
    list.forEach((entry) => materials.add(entry.uuid))
  })
  return { meshCount, primitiveCount, vertexCount, triangleCount, materialCount: materials.size }
}

const outputPath = resolve(process.argv[2] || 'delivery/stk-kart-control-handoff-v1/assets/stk-kart.glb')
const metadataPath = resolve(process.argv[3] || 'delivery/stk-kart-control-handoff-v1/assets/stk-kart.asset.json')
await mkdir(dirname(outputPath), { recursive: true })

const kart = createKart()
kart.updateMatrixWorld(true)
const bounds = new THREE.Box3().setFromObject(kart)
const stats = inventory(kart)
const arrayBuffer = await new GLTFExporter().parseAsync(kart, {
  binary: true,
  onlyVisible: true,
  trs: true,
})
const bytes = Buffer.from(arrayBuffer)
await writeFile(outputPath, bytes)

const metadata = {
  schemaVersion: 1,
  file: 'stk-kart.glb',
  mediaType: 'model/gltf-binary',
  format: 'glb-2.0',
  byteLength: bytes.byteLength,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  coordinateConvention: {
    upAxis: '+Y',
    forwardAxis: '-Z',
    metersPerUnit: 1,
    pivot: 'support-center',
  },
  boundsMeters: {
    minimumXYZ: bounds.min.toArray(),
    maximumXYZ: bounds.max.toArray(),
    sizeXYZ: bounds.getSize(new THREE.Vector3()).toArray(),
  },
  inventory: {
    ...stats,
    textureCount: 0,
    skeletonCount: 0,
    boneCount: 0,
    animationClipNames: [],
  },
  intendedUse: 'static visual asset; target project owns vehicle movement, collision, and camera behavior',
}
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(metadata, null, 2))
