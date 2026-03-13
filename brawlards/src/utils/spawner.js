import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { TABLE_WIDTH, TABLE_DEPTH } from "../assets/objects/BilliardTable.js"
import { CollisionManager } from './collisionManager.js'


// returns a position vector randomly within a slightly smaller area than the table surface
// `baseY` can be used to offset the spawn height (e.g. table top + some clearance)
export function randomPositionAboveTable(height = 5, baseY = 0) {
  // we shrink the available region so objects never spawn exactly on an edge
  const shrinkFactor = 0.9 // 90% of the table dimensions
  const halfW = (TABLE_WIDTH / 2) * shrinkFactor
  const halfD = (TABLE_DEPTH / 2) * shrinkFactor
  const x = (Math.random() * 2 - 1) * halfW
  const z = (Math.random() * 2 - 1) * halfD
  return new THREE.Vector3(x, baseY + height, z)
}

// simplified spawn logic: create mesh/body and integrate with world and hitbox manager
export function spawnObject({
  scene,
  prefab,
  position,
  world,
  physicsMaterials,
  syncList,
  particleManager
}) {
  const mesh = prefab.createMesh()
  scene.add(mesh)
  mesh.position.copy(position)

  // ✨ Optimize: Delayed shadow setup để không block spawn
  // by default spawned objects should cast and receive shadows for consistency,
  // but we defer this setup to avoid frame hitches during spawn
  setTimeout(() => {
    mesh.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }, 0)

  const body = prefab.createBody(physicsMaterials)
  if (body) {
    body.position.copy(position)
    body.name = prefab.name || mesh.name
    world.addBody(body)
  }

  const entry = { mesh, body, type: prefab.type, name: prefab.name }
  syncList.push(entry)

  CollisionManager.addHitboxForObject(entry)

  // spawn a little smoke when object appears
  if (particleManager && particleManager.spawn) {
    particleManager.spawn('smoke', position.clone())
  }

  return entry
}

export function spawnRandom({
  scene,
  dynamicPrefabs,
  world,
  physicsMaterials,
  syncList,
  particleManager,
  height = 7,
  baseY = 0
}) {
  if (!dynamicPrefabs.length) return
  const prefab = dynamicPrefabs[Math.floor(Math.random() * dynamicPrefabs.length)]
  const pos = randomPositionAboveTable(height, baseY)
  return spawnObject({scene, prefab, position: pos, world, physicsMaterials, syncList, particleManager})
}
