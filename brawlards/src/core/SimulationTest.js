import * as THREE from "three"
import * as CANNON from "cannon-es"
import { createAllGameObjects } from "../gameObjects/temp.js"
import { ThirdPersonCameraController } from "../camera/camera3rdPerson.js"
import { UIManager } from "../ui/UIManager.js"
import { GameOverScreen } from "../ui/GameOverScreen.js"
import { PlayerMovementController } from "../playerMovement/playerMovement.js"
import { CharacterController } from "../playerMovement/characterController.js"
import { GuyAI } from "../AI/guyBot.js"
import { Ball8AI } from "../AI/ball8Bot.js"
import { CompuneAI } from "../AI/compuneBot.js"
import { SIMULATOR_COMPUNES } from "../assets/scenes/simulatorDialogs.js"
import { setupContactMaterials, COLLISION_GROUPS, COLLISION_MASKS } from "../physics/physicsHelper.js"
import { setupSceneLighting, FakeShadowManager } from "../lights/createLights.js"
import { CollisionManager } from "../utils/collisionManager.js"
import { spawnObject as spawnerSpawn, spawnRandom as spawnerSpawnRandom, randomPositionAboveTable } from "../utils/spawner.js"
import { PhysicsEventManager } from "../utils/physicsEventManager.js"
import { DestroySystem } from "../utils/destroy.js"
import { ParticleManager } from "../utils/particleManager.js"
import { sceneAssets } from "../assets/sceneAssets.js"
import { Scene1Manager } from "../sceneManager/Scene1Manager.js"

const SIMULATION_CONFIG = {
  fixedTimeStep: 1 / 60,
  spawnRateMs: 1200,
  maxObjectsInScene: 30,
};

export function startSimulationTest(renderer, onBack, gameplayMode = false, sceneIndex = 0) {
  document.body.style.margin = "0"
  document.body.style.overflow = "hidden"

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x111111)

  // Placeholder for cleanup function - will be defined later
  let cleanupFn = null

  // Back button (bottom-right corner, dark red style) - only show in simulator mode
  if (!gameplayMode) {
    const backButton = document.createElement("button")
    backButton.id = "simulationBackButton"
    backButton.innerText = "Back to Menu"
    backButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      background: #8b0000;
      color: #fff;
      border: 2px solid #5a0000;
      border-radius: 0;
      padding: 8px 16px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-weight: bold;
      font-size: 10px;
      letter-spacing: 1px;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 0 12px rgba(255, 0, 0, 0.4), inset 0 0 6px rgba(255, 0, 0, 0.2);
      transition: all 0.3s ease;
    `

    backButton.onmouseover = () => {
      backButton.style.boxShadow = `0 0 20px rgba(255, 0, 0, 0.6), inset 0 0 10px rgba(255, 0, 0, 0.3)`
      backButton.style.transform = 'scale(1.05)'
    }
    backButton.onmouseout = () => {
      backButton.style.boxShadow = `0 0 12px rgba(255, 0, 0, 0.4), inset 0 0 6px rgba(255, 0, 0, 0.2)`
      backButton.style.transform = 'scale(1)'
    }

    // Call cleanup function when back button is clicked
    backButton.onclick = () => {
      if (cleanupFn) cleanupFn()
      onBack()
    }
    document.body.appendChild(backButton)
  }

  const fakeShadowManager = new FakeShadowManager(scene)

  function spawnSceneAsset(asset) {
    syncList.forEach(entry => {
      if (entry.body) world.removeBody(entry.body)
      scene.remove(entry.mesh)
    })
    syncList.length = 0
    characterControllers.clear()
    guyAIControllers.clear()
    ball8AIControllers.clear()
    compuneAIControllers.forEach(compuneAI => compuneAI.cleanup())
    compuneAIControllers.clear()
    destroySystem.resetCharacterDestroyState()

    fakeShadowManager.clearAll()

    sceneBodies.forEach(b => world.removeBody(b))
    sceneBodies.length = 0

    const oldLights = scene.children.filter(c => c.isLight)
    oldLights.forEach(l => scene.remove(l))
    scene.fog = null

    if (currentSceneGroup) scene.remove(currentSceneGroup)

    currentSceneGroup = asset.factory()
    scene.add(currentSceneGroup)

    particleManager.setGroundObjects(currentSceneGroup.children)

    fakeShadowManager.setGroundObjects(currentSceneGroup.children)

    if (currentSceneGroup.userData.applyLighting) {
      try {
        lightController = currentSceneGroup.userData.applyLighting(scene, renderer)
      } catch (err) {
        console.error('Error applying scene lighting:', err)
        lightController = setupSceneLighting(scene, renderer, {
          fogType: 'none',
          fogColor: 0x111111,
          shadows: true,
          shadowMapSize: 2048,
          shadowBias: -0.0001,
          directionalLight: {
            color: 0xfff5d1,
            intensity: 2.5,
            position: [15, 25, 15],
            castShadow: true,
          },
          pointLights: [],
          spotLights: [],
          helpers: false,
        })
      }
    }

    // Add Person Trigger to HitboxManager
    const personMesh = currentSceneGroup.getObjectByName("Person");
    if (personMesh && personMesh.userData.triggerShape) {
        const triggerDef = personMesh.userData.triggerShape;
        const shape = new CANNON.Sphere(triggerDef.radius);
        shape.collisionResponse = 0; // Make it a trigger

        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.STATIC,
        });
        
        const personHeight = 4; // Should match scene1.js
        const bodyPosition = personMesh.position.clone().setY(personMesh.position.y + personHeight / 2);
        body.position.copy(bodyPosition);

        body.addShape(shape);
        world.addBody(body);

        syncList.push({
            body: body,
            mesh: null, // No mesh to sync
            name: 'PersonTrigger',
            type: 'static'
        });
    }

    if (cameraController.getTarget()) {
      cameraController.focus(currentSceneGroup)
    }

    // Initialize scene manager dựa trên scene type
    if (currentSceneManager) {
      currentSceneManager.reset()
      currentSceneManager = null
    }
    if (asset.name === "Pilot Room") {
      currentSceneManager = new Scene1Manager(currentSceneGroup, destroySystem, scene)
      
      // ✨ NEW: Only show GameOverScreen in gameplay mode (not in SimulationTest/Inspector)
      if (gameplayMode) {
        gameOverScreen = new GameOverScreen(asset.name, 0, onBack, cameraController)
        
        // Register callback with Scene1Manager for gameplay mode
        currentSceneManager.setGameOverCallback((reason, completionTime) => {
          const sceneName = reason === 'elevator' ? `${asset.name} - COMPLETED` : `${asset.name} - FAILED`
          gameOverScreen.sceneName = sceneName
          gameOverScreen.completionTime = completionTime
          gameOverScreen.reason = reason  // ✨ Set reason for status message
          gameOverScreen.show()
        })
      }
      
      // Initialize scene manager's spawning system
      const guyAsset = objects.find(obj => obj.name === 'Guy')
      if (guyAsset) {
        currentSceneManager.initializeSpawning(
          spawnerSpawn,
          guyAsset,
          world,
          physicsMaterials,
          syncList,
          particleManager,
          SIMULATION_CONFIG,
          renderer
        )
      } else {
        console.warn('[SimulationTest] Guy asset not found, spawning disabled')
      }
      
      // Spawn test portal doors below the floor
      const door1Asset = objects.find(o => o.name === 'Door (Portal 1)')
      const door2Asset = objects.find(o => o.name === 'Door (Portal 2)')
      
      if (door1Asset && door2Asset) {
        // Door 1: Front gate (left side, below floor)
        const door1Mesh = door1Asset.createMesh()
        door1Mesh.position.set(-15, -2, 10)
        const door1Body = door1Asset.createBody(physicsMaterials)
        door1Body.position.copy(door1Mesh.position)
        scene.add(door1Mesh)
        world.addBody(door1Body)
        
        // Door 2: Rear door (right side, below floor)
        const door2Mesh = door2Asset.createMesh()
        door2Mesh.position.set(15, -2, 10)
        const door2Body = door2Asset.createBody(physicsMaterials)
        door2Body.position.copy(door2Mesh.position)
        scene.add(door2Mesh)
        world.addBody(door2Body)
        
        // Link the doors together
        door1Mesh.userData.linkedDoor = { mesh: door2Mesh }
        door2Mesh.userData.linkedDoor = { mesh: door1Mesh }
        
        // Add to syncList
        syncList.push({
          body: door1Body,
          mesh: door1Mesh,
          name: 'Door (Portal 1)',
          type: 'static'
        })
        syncList.push({
          body: door2Body,
          mesh: door2Mesh,
          name: 'Door (Portal 2)',
          type: 'static'
        })
        
        console.log('✓ Test portal doors spawned below floor')
      }
    }

    const tableObj = currentSceneGroup.getObjectByName("Billiard Table")
    
    if (tableObj && tableObj.userData && tableObj.userData.tableDimensions && tableObj.userData.tableDimensions.clothColor) {
      physicsEventManager.setTableColor(tableObj.userData.tableDimensions.clothColor);
    }

    destroySystem.setTable(tableObj)

    // ✨ Process physics for dynamic scene objects (like Elevator Door)
    // NOTE: Skip 'Billiard Table' since it's already handled by the code below (merged into root.userData.physics)
    currentSceneGroup.traverse((child) => {
      if (child === currentSceneGroup) return  // Skip root
      if (child.name === "Billiard Table") return  // Skip Billiard Table (handled by code below)
      if (child.userData && child.userData.physics && child.userData.physics.shapes) {
        const phys = child.userData.physics
        phys.shapes.forEach(def => {
          let shape
          if (def.type === 'box') {
            const [sx, sy, sz] = def.size
            shape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2))
          } else if (def.type === 'sphere') {
            shape = new CANNON.Sphere(def.radius)
          } else if (def.type === 'cylinder') {
            shape = new CANNON.Cylinder(def.radiusTop, def.radiusBottom, def.height, 16)
          }

          if (!shape) return

          const body = new CANNON.Body({
            mass: 0,
            material: physicsMaterials[def.material || phys.material] || physicsMaterials.default,
            collisionFilterGroup: COLLISION_GROUPS.STATIC,
            collisionFilterMask: COLLISION_MASKS.STATIC,
          })

          // Position body at mesh's position + offset
          if (def.offset) {
            body.position.set(
              child.position.x + def.offset[0],
              child.position.y + def.offset[1],
              child.position.z + def.offset[2]
            )
          } else {
            body.position.copy(child.position)
          }
          
          // Copy rotation from mesh if not specified in def
          if (def.rotation) {
            body.quaternion.setFromEuler(...def.rotation)
          } else if (child.quaternion) {
            body.quaternion.copy(child.quaternion)
          }

          body.addShape(shape)
          body.name = child.name || 'DynamicSceneObject'
          world.addBody(body)
          sceneBodies.push(body)

          syncList.push({ body, mesh: child, type: 'static', name: child.name || 'scene_object' })
          CollisionManager.addHitboxForObject(syncList[syncList.length - 1])
        })
      }
    })

    const phys = currentSceneGroup.userData.physics
    if (phys && phys.shapes) {
      phys.shapes.forEach(def => {
        let shape
        if (def.type === 'box') {
          const [sx, sy, sz] = def.size
          shape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2))
        } else if (def.type === 'sphere') {
          shape = new CANNON.Sphere(def.radius)
        } else if (def.type === 'cylinder') {
          shape = new CANNON.Cylinder(def.radiusTop, def.radiusBottom, def.height, 16)
        }

        if (!shape) return

        const body = new CANNON.Body({
          mass: 0,
          material: physicsMaterials[def.material || phys.material] || physicsMaterials.default,
          collisionFilterGroup: COLLISION_GROUPS.STATIC,
          collisionFilterMask: COLLISION_MASKS.STATIC,
        })
        
        if (def.material === 'rail') {
            body.collisionFilterGroup = COLLISION_GROUPS.RAIL;
            body.collisionFilterMask = COLLISION_MASKS.RAIL;
        }

        if (def.offset) body.position.set(...def.offset)
        if (def.rotation) body.quaternion.setFromEuler(...def.rotation)

        body.addShape(shape)
        body.name = asset.name || 'SceneObject' // Set body name for debugging
        world.addBody(body)
        sceneBodies.push(body)

        syncList.push({ body, type: 'static', name: asset.name || 'scene' })
        CollisionManager.addHitboxForObject(syncList[syncList.length - 1]);
      })
    }
    updateUIText();
  }

  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

  const cameraController = new ThirdPersonCameraController(renderer)
  const camera = cameraController.camera
  const uiManager = new UIManager()
  uiManager.setCamera(camera)
  cameraController.setUIManager(uiManager)
  
  // ✨ Debug: Log initial camera state
  console.log('%c[SimulationTest] Camera initialized', 'color: #0099ff; font-weight: bold')
  console.log('  - isControlEnabled:', cameraController.isControlEnabled)
  console.log('  - Cursor style:', cameraController.renderer.domElement.style.cursor)
  console.log('  - Crosshair display:', cameraController.crosshair ? cameraController.crosshair.style.display : 'N/A')
  
  // ✨ Set scene for camera collision detection
  cameraController.setScene(scene)
  
  // Set gameplay mode - locks camera on player, disables spectator
  cameraController.setGameplayMode(gameplayMode)
  
  // ✨ Camera starts LOCKED in both Play and Simulator modes (hold C to unlock, release C to lock)
  cameraController.enableControl()

  const world = new CANNON.World()
  world.gravity.set(0, -9.82, 0)
  const physicsMaterials = setupContactMaterials(world)

  const playerMovement = new PlayerMovementController(camera, scene, physicsMaterials, renderer.domElement)
  const characterControllers = new Map()
  const guyAIControllers = new Map()
  const ball8AIControllers = new Map()
  const compuneAIControllers = new Map()

  let lightController = setupSceneLighting(scene, renderer, {
    fogType: 'none',
    fogColor: 0x111111,
    shadows: true,
    shadowMapSize: 2048,
    shadowBias: -0.0001,
    directionalLight: {
      color: 0xfff5d1,
      intensity: 2.5,
      position: [15, 25, 15],
      castShadow: true,
    },
    pointLights: [],
    spotLights: [],
    helpers: false,
  })

  const sceneBodies = []

  let currentSceneGroup = null
  let currentSceneManager = null
  let lastTime = performance.now()

  const syncList = []
  const objects = createAllGameObjects(renderer)

  const destroySystem = new DestroySystem({ syncList, world, scene })

  const particleManager = new ParticleManager(scene)

  destroySystem.setParticleManager(particleManager)
  
  // Pass syncList and destroySystem to playerMovement for Ball 8 destruction on cue stroke
  playerMovement.setSyncListAndDestroySystem(syncList, destroySystem)
  
  // Pass particleManager to playerMovement for spawning effects
  playerMovement.setParticleManager(particleManager)

  const physicsEventManager = new PhysicsEventManager({ particleManager, syncList })

  let possessed = null

  destroySystem.setOnDestroy(entry => {
    if (entry === possessed) {
      if (possessed.name === 'Player') {
        playerMovement.removeCueBody()
        if (possessed.mesh && possessed.mesh.userData.removeCue) {
          possessed.mesh.userData.removeCue()
        }
        playerMovement.cueActive = false
        
        // ✨ NEW: Notify Scene1Manager that player was destroyed
        if (gameplayMode && currentSceneManager) {
          currentSceneManager.onPlayerDestroyed()
        }
      }
      possessed = null
      cameraController.clearFocus()
    }
    if (entry && entry.mesh) {
      fakeShadowManager.removeShadow(entry.mesh)
    }
    if (entry && entry.mesh) {
      const pos = entry.mesh.position.clone()
      particleManager.spawn('smoke', pos)
    }
    // Cleanup AI controllers when character/ball is destroyed
    if (guyAIControllers.has(entry)) {
      guyAIControllers.delete(entry)
    }
    if (ball8AIControllers.has(entry)) {
      ball8AIControllers.delete(entry)
    }
    CollisionManager.removeHitboxForObject(entry)
  })

  let animationId
  let gameOverScreen = null

  CollisionManager.init({ scene, syncList, sceneObjects: [] });

  const hitboxText = document.createElement("div")
  hitboxText.style.position = "absolute"
  hitboxText.style.bottom = "20px"
  hitboxText.style.left = "20px"
  hitboxText.style.color = "white"
  hitboxText.style.backgroundColor = "rgba(0,0,0,0.5)"
  hitboxText.style.padding = "5px 10px"
  hitboxText.style.borderRadius = "5px"
  hitboxText.style.fontFamily = "Arial"
  hitboxText.style.whiteSpace = "pre"
  hitboxText.style.zIndex = "1000"
  // ✨ Only show hitbox display UI in simulator (not in gameplay mode)
  hitboxText.style.display = gameplayMode ? "none" : "block"
  hitboxText.textContent = "Display: Normal (P) | Spawn: R (1.2s, max 30 objs)\nSpectator: WASD + Space/Shift"
  document.body.appendChild(hitboxText)

  function updateUIText() {
    const modeStr = CollisionManager.getVisibilityStateString()
    if (gameplayMode) {
      hitboxText.textContent = `Display: ${modeStr} (P)`
    } else {
      hitboxText.textContent = `Display: ${modeStr} (P) | Spawn: R (1.2s, max 30 objs)\nSpectator: WASD + Space/Shift`
    }
  }

  const scenes = sceneAssets
  if (scenes.length) {
    const loadIndex = gameplayMode ? Math.min(sceneIndex, scenes.length - 1) : 0
    spawnSceneAsset(scenes[loadIndex])
    CollisionManager.setSceneObjects(currentSceneGroup)
    updateUIText()
  }

  const dynamicPrefabs = objects.filter(o => o.type === "dynamic")

  // Auto-spawn player in gameplay mode
  if (gameplayMode && currentSceneGroup) {
    setTimeout(() => {
      const playerAsset = dynamicPrefabs.find(o => o.name === 'Player')
      if (playerAsset && currentSceneManager) {
        // ✨ Use Scene1Manager to spawn player at proper position
        const playerEntry = currentSceneManager.spawnPlayer(playerAsset, scene)
        
        if (playerEntry && playerEntry.mesh) {
          possessed = playerEntry
          playerEntry.mesh.userData.createCue && playerEntry.mesh.userData.createCue()
          playerMovement.cueActive = true
          playerMovement.enableInput()  // ✨ Re-enable input for player control
          cameraController.focus(playerEntry.mesh)
          // ✨ Camera starts unlocked - user presses C to lock it
        }
      }
    }, 100)
  }


  function spawnRandom() {
    const dynamicObjectCount = syncList.filter(e => e.type === 'dynamic').length
    if (dynamicObjectCount >= SIMULATION_CONFIG.maxObjectsInScene) {
      return
    }

    let baseY = 0
    const table = currentSceneGroup.getObjectByName("Billiard Table")
    if (table && table.userData && table.userData.tableDimensions) {
      baseY = table.userData.tableDimensions.topY || 0
    }

    spawnerSpawnRandom({
      scene,
      dynamicPrefabs,
      world,
      physicsMaterials,
      syncList,
      particleManager,
      height: 12,
      baseY
    })
  }

  const container = document.createElement("div")
  container.classList.add("page-ui")
  container.style.position = "absolute"
  container.style.top = "20px"
  container.style.left = "20px"
  container.style.zIndex = "1000"
  container.style.display = gameplayMode ? "none" : "flex"
  container.style.gap = "10px"
  document.body.appendChild(container)

  // ✨ Scene dropdown removed - simulator always loads Pilot Room by default

  const select = document.createElement("select")
  select.style.padding = "8px"
  select.style.fontSize = "16px"
  select.style.backgroundColor = "#333"
  select.style.color = "white"
  select.style.border = "1px solid #666"
  select.style.borderRadius = "4px"
  select.style.minWidth = "150px"

  const defaultOption = document.createElement("option")
  defaultOption.textContent = "Spawn Specific Object"
  defaultOption.value = ""
  select.appendChild(defaultOption)

  dynamicPrefabs.forEach((asset, index) => {
    const option = document.createElement("option")
    option.value = index
    option.textContent = asset.name || `Object ${index}`
    select.appendChild(option)
  })

  select.addEventListener("focus", () => {
    if (!gameplayMode) {
      playerMovement.disableInput()  // ✨ Disable input while dropdown is open
      playerMovement.resetKeys()
    }
  })

  container.appendChild(select)

  function spawnSelected(index) {
    const prefab = dynamicPrefabs[index]
    if (!prefab) return
    const pos = randomPositionAboveTable(8)
    spawnerSpawn({scene, prefab, position: pos, world, physicsMaterials, syncList, particleManager})
  }

  select.addEventListener("change", () => {
    if (select.value === "") return
    spawnSelected(Number(select.value))
    select.value = ""
    select.blur()
    playerMovement.enableInput()  // ✨ Re-enable input when dropdown closes
  })

  // ✨ Scene selection removed - Pilot Room always loaded by default

  let spawnIntervalId = null

  function startSpawning() {
    if (spawnIntervalId !== null) return
    // Don't auto-spawn in gameplay mode
    if (gameplayMode) return
    spawnIntervalId = setInterval(() => {
      if (!possessed) spawnRandom()
    }, SIMULATION_CONFIG.spawnRateMs)
  }

  function stopSpawning() {
    if (spawnIntervalId !== null) {
      clearInterval(spawnIntervalId)
      spawnIntervalId = null
    }
  }

  function onKeyDown(e) {
    if (e.target === select) {
      return;
    }

    // Disable spectator controls in gameplay mode
    if (gameplayMode) {
      if (e.code === "Escape") {
        // ✨ In gameplay mode: only disable pointer lock, keep focus on player
        playerMovement.disableInput()  // ✨ Completely disable input to prevent ghost movement
        if (possessed && possessed.body) {
          possessed.body.velocity.set(0, possessed.body.velocity.y, 0)  // ✨ Stop horizontal movement
        }
        cameraController.disableControlOnly()
        return
      } else {
        // ✨ Only allow C key in gameplay mode (for camera control)
        if (e.code !== "KeyC") return
      }
    }

    if (e.code === "KeyR" && !possessed) {
      startSpawning()
    }
    // ✨ P key only works in simulator, not in gameplay mode
    if (e.code === "KeyP" && !gameplayMode) {
      CollisionManager.cycleVisibilityMode()
      updateUIText()
    }
    if (e.code === "Escape" && !gameplayMode) {
      // ✨ Synchronized with gameplay mode: just disable input + exit pointer lock
      // Keep possessed object so _handleMovement keeps zeroing velocity each frame
      playerMovement.disableInput()
      if (possessed && possessed.body) {
        possessed.body.velocity.set(0, possessed.body.velocity.y, 0)
      }
      cameraController.disableControlOnly()
    }
  }

  function onKeyUp(e) {
    if (e.code === "KeyR") {
      stopSpawning()
    }
    // ✨ PlayerMovementController._onKeyUp handles WASD key releases automatically
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)

  // ✨ Track C key state to distinguish C-unlock from Escape-unlock
  let cKeyHeld = false
  window.addEventListener("keydown", (e) => { if (e.code === "KeyC") cKeyHeld = true })
  window.addEventListener("keyup", (e) => { if (e.code === "KeyC") cKeyHeld = false })

  // ✨ Catch pointer lock exit to prevent ghost movement
  // Browser may swallow Escape keydown during pointer lock, so onKeyDown(Escape) never fires.
  // This handler reliably detects pointer lock exit regardless of how it happened.
  function onPointerLockChange() {
    const locked = document.pointerLockElement === renderer.domElement
    if (!locked && !cKeyHeld) {
      // Pointer lock lost and NOT caused by C key → must be Escape or browser action
      playerMovement.disableInput()
      if (possessed && possessed.body) {
        possessed.body.velocity.set(0, possessed.body.velocity.y, 0)
      }
    } else if (locked) {
      // Pointer lock regained (user clicked to resume) → re-enable input
      playerMovement.enableInput()
    }
  }
  document.addEventListener("pointerlockchange", onPointerLockChange)

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  function onClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)
    
    const meshes = syncList.filter(item => item.type === "dynamic").map(item => item.mesh)
    const intersects = raycaster.intersectObjects(meshes, true)
    const validIntersects = intersects.filter(hit => !hit.object.userData?.isTriggerBox)
    
    if (validIntersects.length > 0) {
      let root = validIntersects[0].object
      while (root.parent && !meshes.includes(root)) root = root.parent
      const entry = syncList.find(e => e.mesh === root)
      if (possessed && possessed.name === 'Player' && possessed !== entry) {
        playerMovement.removeCueBody()
        if (possessed.mesh.userData.removeCue) {
          possessed.mesh.userData.removeCue()
        }
        playerMovement.cueActive = false
      }
      if (entry) {
        possessed = entry
        playerMovement.enableInput()  // ✨ Re-enable input when possessing new object
        if (possessed.name === 'Player') {
          playerMovement.cueActive = true
          if (possessed.mesh.userData.createCue) {
            possessed.mesh.userData.createCue()
          }
        }
        cameraController.focus(entry.mesh)
      }
    }
  }

  renderer.domElement.addEventListener("click", onClick)

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener("resize", onResize)

  function animate() {
    animationId = requestAnimationFrame(animate)
    const currentTime = performance.now()
    const delta = Math.min((currentTime - lastTime) / 1000, 0.1)
    lastTime = currentTime

    // ✨ Update GameOverScreen timer and auto-return (must be before early return)
    if (gameOverScreen && gameplayMode) {
      gameOverScreen.update(delta)
    }

    // ✨ NEW: Stop all updates if game is over in gameplay mode
    if (gameplayMode && currentSceneManager && currentSceneManager.gameOver) {
      // Still render, but don't update physics, AI, or player movement
      renderer.render(scene, cameraController.camera)
      return
    }

    if (possessed) {
      playerMovement.update(possessed.body, possessed.mesh, cameraController)
      
      if (possessed.name === "Player") {
        if (playerMovement.isCharging()) {
          if (playerMovement.cueBody && !playerMovement.cueBody.userData?.hitboxAdded) {
            CollisionManager.addHitboxForObject({ 
              body: playerMovement.cueBody, 
              name: 'Cue', 
              type: 'kinematic' 
            })
            if (!playerMovement.cueBody.userData) playerMovement.cueBody.userData = {}
            playerMovement.cueBody.userData.hitboxAdded = true
          }
          if (playerMovement.forceBody && !playerMovement.forceBody.userData?.hitboxAdded) {
            CollisionManager.addHitboxForObject({ 
              body: playerMovement.forceBody, 
              name: 'Force', 
              type: 'trigger' 
            })
            if (!playerMovement.forceBody.userData) playerMovement.forceBody.userData = {}
            playerMovement.forceBody.userData.hitboxAdded = true
          }

          const chargeAmount = playerMovement.getChargeAmount()
          const currentTipPos = playerMovement.getCueTipPosition(possessed.mesh)
          const originalTipPos = playerMovement.getOriginalCueTipPosition(possessed.mesh)
          uiManager.updateChargeIndicator(true, originalTipPos, camera)
          uiManager.updateChargeLine(true, currentTipPos, originalTipPos, camera)
          uiManager.updatePowerBar(true, chargeAmount)
        } else {
          uiManager.updateChargeIndicator(false)
          uiManager.updateChargeLine(false)
          uiManager.updatePowerBar(false)
        }
      } else {
        uiManager.updateChargeIndicator(false)
        uiManager.updateChargeLine(false)
        uiManager.updatePowerBar(false)
      }
    }

    syncList.forEach(entry => {
      if (!entry.mesh || !entry.body || entry.name === 'Player' || entry.type !== 'dynamic' || entry.body.userData?.physicsEventRegistered === undefined) {
        return
      }
      if (entry.name.includes('Ball')) return

      const characterName = entry.name
      if (!characterControllers.has(characterName)) {
        characterControllers.set(characterName, new CharacterController(camera))
      }
      const charController = characterControllers.get(characterName)

      if (entry === possessed) {
        charController.updatePossessedMode(entry.mesh, entry.body)
      } else if (characterName !== 'Guy') {
        charController.updateIdleMode(entry.mesh, entry.body)
      }

      if (characterName === 'Guy' && entry !== possessed) {
        if (!guyAIControllers.has(entry)) {
          const guyAI = new GuyAI(entry.mesh, entry.body, scene)
          guyAIControllers.set(entry, guyAI)
          if (!entry.body.userData) entry.body.userData = {}
          entry.body.userData.guyAI = guyAI
        }
        const guyAI = guyAIControllers.get(entry)
        const targetYaw = guyAI.update(delta, syncList)
        if (targetYaw !== null) {
          charController.setBodyYaw(entry.mesh, targetYaw)
        }
      }

      // Ball 8 AI logic
      if (characterName === 'Ball 8') {
        if (!ball8AIControllers.has(entry)) {
          const ball8AI = new Ball8AI(entry.mesh, entry.body, scene, particleManager)
          ball8AIControllers.set(entry, ball8AI)
          if (!entry.body.userData) entry.body.userData = {}
          entry.body.userData.ball8AI = ball8AI
        }
        const ball8AI = ball8AIControllers.get(entry)
        ball8AI.update(delta, syncList)
      }

      // Compune AI logic
      if (characterName === 'Compune') {
        // Check if CompuneAI was already created by Scene1Manager (for Scene1 compunes)
        // If not, create it with simulator dialog (for simulator compunes)
        let compuneAI = entry.body.userData?.compuneAI
        if (!compuneAI) {
          // Scene1Manager didn't create it, so use simulator dialog
          compuneAI = new CompuneAI(entry.mesh, entry.body, scene)
          compuneAI.setDialog(SIMULATOR_COMPUNES.default)  // "Hello world!"
          if (!entry.body.userData) entry.body.userData = {}
          entry.body.userData.compuneAI = compuneAI
        }
        compuneAIControllers.set(entry, compuneAI)
        compuneAI.update(delta, syncList)

        // Despawn is handled by DestroySystem.checkCharacterDestroyConditions()
        // when compuneAI.state === 'disconnecting' for 10+ seconds
      }
    })

    // Update Ball 8 AI separately since balls are excluded from main character loop
    syncList.forEach(entry => {
      if (!entry.mesh || !entry.body || entry.name !== 'Ball 8') {
        return
      }

      if (!ball8AIControllers.has(entry)) {
        const ball8AI = new Ball8AI(entry.mesh, entry.body, scene, particleManager)
        ball8AIControllers.set(entry, ball8AI)
        if (!entry.body.userData) entry.body.userData = {}
        entry.body.userData.ball8AI = ball8AI
      }
      
      const ball8AI = ball8AIControllers.get(entry)
      ball8AI.update(delta, syncList)
    })

    physicsEventManager.reset();

    world.step(SIMULATION_CONFIG.fixedTimeStep, delta, 3)

    syncList.forEach(pair => {
      if (pair.body && pair.mesh) {
        pair.mesh.position.copy(pair.body.position)
        const isCharacter = ['Player', 'Guy', 'Guide', 'Dummy', 'Compune'].includes(pair.name)
        if (!isCharacter) {
          pair.mesh.quaternion.copy(pair.body.quaternion)
        }
      }
      if (pair.body) {
        if (!pair.body.userData) {
          pair.body.userData = {}
        }
        if (!pair.body.userData.physicsEventRegistered) {
          const isDynamicCharacter = ['Player', 'Guy', 'Guide', 'Dummy', 'Compune'].includes(pair.name)
          if (pair.name && (pair.name.includes('Ball') || isDynamicCharacter)) {
            physicsEventManager.registerBody(pair.body)
            pair.body.userData.physicsEventRegistered = true
          }
        }
      }
    })

    syncList.forEach(entry => {
      if (entry.type === 'dynamic' && entry.mesh && entry.mesh.userData.shadowConfig) {
        if (!entry.mesh.userData.hasFakeShadow) {
          const config = entry.mesh.userData.shadowConfig
          fakeShadowManager.addShadow(entry.mesh, config)
          entry.mesh.userData.hasFakeShadow = true
        }
      }
    })

    fakeShadowManager.update()
    CollisionManager.update()
    destroySystem.update()
    particleManager.update(delta)
    
    // Update scene manager (handles ball spawning, compune despawn, etc)
    if (currentSceneManager) {
      currentSceneManager.update(delta, world, syncList, particleManager)
    }

    syncList.forEach(entry => {
      if (entry.mesh && entry.mesh.userData && typeof entry.mesh.userData.update === 'function') {
        entry.mesh.userData.update(delta, particleManager)
      }
    })

    cameraController.update(delta)
    renderer.render(scene, camera)
  }

  animate()

  cleanupFn = function cleanup() {
    const simBackBtn = document.getElementById("simulationBackButton")
    if (simBackBtn) simBackBtn.remove()
    
    cancelAnimationFrame(animationId)
    window.removeEventListener("keydown", onKeyDown)
    window.removeEventListener("keyup", onKeyUp)
    window.removeEventListener("resize", onResize)
    document.removeEventListener("pointerlockchange", onPointerLockChange)
    renderer.domElement.removeEventListener("click", onClick)
    select.remove()
    hitboxText.remove()
    if (cameraController.dispose) cameraController.dispose()
    
    // Cleanup compunes
    compuneAIControllers.forEach(compuneAI => compuneAI.cleanup())
    compuneAIControllers.clear()
    
    CollisionManager.dispose()

    // Cleanup scene manager
    if (currentSceneManager) {
      currentSceneManager.reset()
      currentSceneManager = null
    }

    // Cleanup UI manager
    if (uiManager) {
      uiManager.dispose()
    }

    fakeShadowManager.clearAll()
    
    syncList.forEach(pair => {
      if (pair.body) world.removeBody(pair.body)
      if (pair.mesh) scene.remove(pair.mesh)

    })
    scene.clear()
  }

  return cleanupFn
}