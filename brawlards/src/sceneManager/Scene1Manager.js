import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CompuneAI } from '../AI/compuneBot.js'
import { SCENE1_COMPUNES } from '../assets/scenes/scene1Dialogs.js'
import { COLLISION_GROUPS, COLLISION_MASKS } from '../physics/physicsHelper.js'
import { createSweatEffect } from '../effects/particles/particle8.js'

const FLICKER_CONFIG = {
  offColor: "#666666",
  onColor: "#ffffff",
  offEmissiveIntensity: 0,
  onEmissiveIntensityMultiplier: 2.0
}

const WINDOW_CONFIG = {
  elevation: 11,
  height: 9
}

const SCENE1_CONFIG = {
  lightFlickerDuration: 2.0,
  ambientLightFlickerDuration: 1.0,
  baseAmbientIntensity: 0.6,
  phaseChangeIntensityReduction: 0.08,
  baseFogDensity: 0.002,
  phaseChangeFogIncrease: 0.0004,
  baseSunIntensity: 2500,
  waterSplashInterval: 0.6,
  waterSplashPosition: { x: 9.5, y: 4.3, z: 5.0 },
  guySpawnPosition: { x: 9.5, y: 2.5, z: 5.0 },
  waterSplashSpread: 1.2,
  waterSplashRandomY: 0.4,
  personHeight: 4,
  sunLightDimFactor: 0.9,
  sunLightMinIntensity: 50,
  sunLightBaseFar: 200,
  blackoutSunLightIntensity: 1250,
  blackoutAmbientIntensity: 0.18  // 30% of baseAmbientIntensity (0.6)
}

export class Scene1Manager {
  constructor(sceneGroup, destroySystem = null, mainScene = null) {
    this.sceneGroup = sceneGroup
    this.mainScene = mainScene
    this.destroySystem = destroySystem
    
    // Spawning system dependencies
    this.spawner = null
    this.guyAsset = null
    this.world = null
    this.physicsMaterials = null
    this.syncList = null
    this.particleManager = null
    this.SIMULATION_CONFIG = null
    this.renderer = null
    
    this.flickerTimer = 0
    this.leakTimer = 0
    this.lightFlickerTimer = 0
    this.isLightFlickeringActive = false
    
    this.ambientLightFlickerTimer = 0
    this.isAmbientFlickering = false
    this.ambientLight = null
    this.baseAmbientIntensity = SCENE1_CONFIG.baseAmbientIntensity
    this.currentAmbientIntensity = SCENE1_CONFIG.baseAmbientIntensity
    this.phaseChangeIntensityReduction = SCENE1_CONFIG.phaseChangeIntensityReduction
    this.totalPhaseChanges = 0
    
    this.baseFogDensity = SCENE1_CONFIG.baseFogDensity
    this.currentFogDensity = SCENE1_CONFIG.baseFogDensity
    this.phaseChangeFogIncrease = SCENE1_CONFIG.phaseChangeFogIncrease
    
    this.guyFlickerTimers = new Map()
    this.ballEventFlickerTimer = 0  // Track ball event flickering (ball 7, reset)
    this.guyCount = 0
    this.lastGuyCount = 0
    
    this.hookedGuyAIs = new Set()
    
    this.sunLight = null
    this.baseSunIntensity = SCENE1_CONFIG.baseSunIntensity
    
    this.lightsInitialized = false
    
    // ✨ NEW: Elevator door system
    this.elevatorDoor = null
    this.elevatorDoorOpened = false
    this.elevatorDoorPhaseTriggered = false
    this.elevatorCountdownActive = false
    this.elevatorCountdownTimer = 0
    this.elevatorCountdownDuration = 30 // 30 seconds from 15 to 0 (down from 50)
    this.elevatorCountdownFinished = false // Flag to keep display at 0 after countdown completes
    this.elevatorFinalDisplayValue = null // Store 0 to display when countdown finishes
    this.elevatorDoorTouched = false // Flag to track if player touched open door (log once)
    
    // ✨ NEW: Game over system
    this.gameOver = false
    this.gameOverTime = 0  // Time when game ended
    this.gameStartTime = null  // Time when game started (for completion time tracking)
    this.gameOverReason = null  // 'elevator' or 'death'
    this.gameOverCallback = null  // Callback function to show game over screen
    this.gameOverCallbackTriggered = false  // Flag to ensure callback only called once
    
    // ✨ NEW: Sweat effects array (updated by update() method)
    this.activeSweatEffects = [] // Array of sweat effect objects
    
    this.personMesh = null
    this.riseProgress = 0
    this.isRetracting = false
    this.initialY = 0
    this.targetY = 0
    
    this.wElev = WINDOW_CONFIG.elevation
    this.wHeight = WINDOW_CONFIG.height
    
    // Blackout system (lights off when player falls)
    this.blackoutTimer = 0
    this.blackoutDuration = 3000  // 3 seconds in milliseconds
    this.isBlackoutActive = false
    
    // Ball spawning system for scene 1
    this.playerSpawned = false
    this.sceneStartTime = 0
    this.compuneAI = null
    this.compuneAsset = null
    this.compuneMesh = null
    this.compuneSpawnedActivated = false // Flag to ensure ball spawning only activates once
    this.ballSpawnStartTime = 0
    this.lastBallBatchSpawnTime = 0
    this.ballsDestroyedThisBatch = 0
    this.ballSpawnSequence = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15] // ✨ All balls EXCEPT ball 8 (spawns separately at end)
    this.ballBatchIndex = 0
    this.currentBatchBalls = []
    this.ballSpawningActive = false
    this.allBallsSpawned = false
    this.ballAssets = {}
    this.currentBatchSpawningComplete = true // Track if current batch scheduling is done
    
    // ✨ NEW: Scoring system
    this.destroySequence = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8] // ✨ Expected destroy order (ball 8 last)
    this.nextExpectedBallIndex = 0 // Index in destroySequence of next expected ball to destroy
    this.currentScore = 0 // Debug: log when correct destruction
    this.resetTimer = 0 // Timer for respawning after reset
    this.isResetActive = false // Flag if reset is in progress
    this.previousBallNames = new Set() // ✨ NEW: Track previous frame's balls to detect destruction
    
    this._initializePersonMesh()
    this._setupSpawnCallback()
  }

  /**
   * Initialize spawning system dependencies
   * Must be called before spawning can occur
   */
  initializeSpawning(spawner, guyAsset, world, physicsMaterials, syncList, particleManager, simulationConfig, renderer) {
    this.spawner = spawner
    this.guyAsset = guyAsset
    this.world = world
    this.physicsMaterials = physicsMaterials
    this.syncList = syncList
    this.particleManager = particleManager
    this.SIMULATION_CONFIG = simulationConfig
    this.renderer = renderer
  }

  /**
   * ✨ NEW: Set callback for when game ends
   * Callback signature: (reason, completionTime) where reason is 'elevator' or 'death'
   */
  setGameOverCallback(callback) {
    this.gameOverCallback = callback
  }

  /**
   * ✨ NEW: Get current completion time in seconds
   */
  getCompletionTime() {
    if (!this.gameStartTime) return 0
    return (Date.now() - this.gameStartTime) / 1000
  }

  /**
   * ✨ Spawn player at center of table for gameplay mode
   */
  spawnPlayer(playerAsset, mainScene) {
    if (!this.spawner || !playerAsset) {
      console.warn('[Scene1Manager] Cannot spawn player: spawner or playerAsset missing')
      return null
    }

    // Get table dimensions to spawn player above its surface
    let spawnPos = new THREE.Vector3(0, 5, 0)  // Default position
    const table = this.sceneGroup.getObjectByName("Billiard Table")
    if (table && table.userData && table.userData.tableDimensions && table.userData.tableDimensions.topY) {
      // Spawn 4 units above table surface so player doesn't immediately fall
      spawnPos.y = table.userData.tableDimensions.topY + 1
    }

    // Spawn player at calculated position
    this.spawner({
      scene: mainScene,
      prefab: playerAsset,
      position: spawnPos,
      world: this.world,
      physicsMaterials: this.physicsMaterials,
      syncList: this.syncList,
      particleManager: this.particleManager
    })

    // Find spawned player in syncList and return it
    const playerEntry = this.syncList.find(e => e.name === 'Player')
    
    if (playerEntry) {
      this.playerSpawned = true
      this.sceneStartTime = Date.now()
      
      // Create cue stick for player (same as SimulationTest does)
      if (playerEntry.mesh && playerEntry.mesh.userData.createCue) {
        playerEntry.mesh.userData.createCue()
        // Mark that player should have active cue
        playerEntry.mesh.userData.shouldHaveCue = true
      }
      
      this._initializeScene1Gameplay(playerEntry, mainScene)
    }
    
    return playerEntry || null
  }
  
  /**
   * Initialize scene1 gameplay: spawn compune and balls
   */
  _initializeScene1Gameplay(playerEntry, mainScene) {
    // Spawn compune 3 units away from player after 3 seconds
    setTimeout(() => {
      this._spawnCompuneCompanion(playerEntry, mainScene)
    }, 3000)
  }
  
  /**
   * Spawn compune companion at fixed location (not relative to player)
   */
  _spawnCompuneCompanion(playerEntry, mainScene) {
    // Import compune asset
    import('../assets/objects/Compune.js').then(module => {
      this.compuneAsset = module.getCompuneAsset()
      
      if (!this.compuneAsset) {
        console.warn('[Scene1Manager] Could not load compune asset')
        return
      }
      
      // ✨ Fixed spawn position (not relative to player)
      // Player spawns at (0, 5, 0) above table center
      // Compune spawns higher and offset along table length
      const spawnPos = new THREE.Vector3(2.5, 10, 0)
      
      // Convert asset to prefab format that spawner expects
      const compunePrefab = {
        name: this.compuneAsset.name,
        type: 'dynamic',
        createMesh: this.compuneAsset.factory,
        createBody: (physicsMaterials) => {
          if (!this.compuneAsset.physics) return null
          const body = new CANNON.Body({
            mass: this.compuneAsset.physics.mass || 1,
            shape: new CANNON.Sphere(this.compuneAsset.physics.radius || 0.5)
          })
          return body
        }
      }
      
      // Spawn compune using the spawner
      this.spawner({
        scene: mainScene,
        prefab: compunePrefab,
        position: spawnPos,
        world: this.world,
        physicsMaterials: this.physicsMaterials,
        syncList: this.syncList,
        particleManager: this.particleManager
      })
      
      // Find compune in syncList and set up dialogue
      const compuneEntry = this.syncList.find(e => e.name === 'Compune')
      if (compuneEntry && compuneEntry.body && compuneEntry.mesh) {
        this.compuneMesh = compuneEntry.mesh
        
        // Create CompuneAI directly here so SimulationTest won't override with simulator dialogs
        if (!compuneEntry.body.userData) compuneEntry.body.userData = {}
        if (!compuneEntry.body.userData.compuneAI) {
          this.compuneAI = new CompuneAI(compuneEntry.mesh, compuneEntry.body, this.mainScene)
          compuneEntry.body.userData.compuneAI = this.compuneAI
          this._startCompuneDialogue()
        } else {
          this.compuneAI = compuneEntry.body.userData.compuneAI
          this._startCompuneDialogue()
        }
      }
      // Despawn happens when compuneAI.shouldDespawn becomes true (after 10s disconnected)
      // No setTimeout here - let update() handle it
    }).catch(err => {
      console.error('[Scene1Manager] Error loading compune asset:', err)
    })
  }
  
  /**
   * Despawn compune from scene
   */
  _despawnCompune() {
    if (this.compuneMesh && this.mainScene) {
      // Remove mesh from scene
      this.mainScene.remove(this.compuneMesh)
    }
    
    // Remove from syncList
    if (this.compuneAI && this.compuneAI.body) {
      const index = this.syncList.findIndex(e => e.body === this.compuneAI.body)
      if (index !== -1) {
        const compuneEntry = this.syncList[index]
        // Remove physics body from world
        if (compuneEntry.body && this.world) {
          this.world.removeBody(compuneEntry.body)
        }
        this.syncList.splice(index, 1)
      }
    }
    
    // Clear references
    this.compuneMesh = null
    this.compuneAI = null
    
    console.log('[Scene1Manager] Compune despawned, ball spawning started')
  }
  
  /**
   * Start compune dialogue sequence
   */
  _startCompuneDialogue() {
    // Use Scene1 dialogs instead of simulator dialogs
    const dialogueTexts = SCENE1_COMPUNES.compune_1
    
    if (this.compuneAI && this.compuneAI.setDialog && dialogueTexts && dialogueTexts.length > 0) {
      this.compuneAI.setDialog(dialogueTexts)
      // Don't show page here - let CompuneAI.update() handle it when player enters trigger zone
    }
  }

  /**
   * Setup spawn callback on destroySystem for when player falls below plane
   */
  _setupSpawnCallback() {
    if (!this.destroySystem) return

    this.destroySystem.setSpawnCallback((player) => {
      // Trigger blackout effect immediately when player falls
      this._triggerBlackout()
      
      // Spawn guy at water leak position when player falls - with 3 second delay
      if (!this.spawner || !this.guyAsset) {
        console.warn('[Scene1Manager] Spawning system not initialized')
        return
      }

      // Check if we haven't exceeded max objects
      if (this.syncList && this.SIMULATION_CONFIG) {
        const dynamicObjectCount = this.syncList.filter(e => e.type === 'dynamic').length
        if (dynamicObjectCount >= this.SIMULATION_CONFIG.maxObjectsInScene) {
          console.warn('[Scene1Manager] Max objects reached, cannot spawn guy')
          return
        }
      }

      // Delay spawn by 3 seconds
      setTimeout(() => {
        // Check again if we can still spawn (conditions may have changed)
        if (this.syncList && this.SIMULATION_CONFIG) {
          const dynamicObjectCount = this.syncList.filter(e => e.type === 'dynamic').length
          if (dynamicObjectCount >= this.SIMULATION_CONFIG.maxObjectsInScene) {
            console.warn('[Scene1Manager] Max objects reached at spawn time, cannot spawn guy')
            return
          }
        }

        // Spawn guy at water leak position
        const guySpawnPos = SCENE1_CONFIG.guySpawnPosition
        const spawnPos = new THREE.Vector3(guySpawnPos.x, guySpawnPos.y, guySpawnPos.z)
        
        try {
          this.spawner({
            scene: this.mainScene,
            prefab: this.guyAsset,
            position: spawnPos,
            world: this.world,
            physicsMaterials: this.physicsMaterials,
            syncList: this.syncList,
            particleManager: this.particleManager
          })
          console.log('[Scene1Manager] Guy spawned at water leak position due to player fall')
        } catch (e) {
          console.error('[Scene1Manager] Error spawning guy', e)
        }
      }, 3000)  // 3 second delay
    })
  }

  /**
   * ✨ NEW: Setup enter key listener for rapid press detection
   * Triggers sweat effect on Compune if pressed too fast (<0.5s)
   */
  _triggerCompuneSweatEffect() {
    // ✨ IMPORTANT: Only trigger if Compune still exists, is active, and is not marked for despawn
    if (!this.compuneMesh || !this.compuneAI || !this.mainScene || this.compuneAI.shouldDespawn) {
      console.warn('[Scene1Manager] Cannot trigger sweat: compune despawned, not initialized, or marked for despawn')
      return
    }

    // Spawn sweat effect at Compune's position
    const sweatEffect = createSweatEffect(this.mainScene, this.compuneMesh.position.clone())
    this.activeSweatEffects.push(sweatEffect)
    console.log(`[Compune] Sweat effect triggered! Active effects: ${this.activeSweatEffects.length}`)
  }

  /**
   * ✨ NEW: Update all active sweat effects
   */
  _updateSweatEffects(delta) {
    // Update and remove finished effects
    for (let i = this.activeSweatEffects.length - 1; i >= 0; i--) {
      const effect = this.activeSweatEffects[i]
      effect.update(delta)
      
      if (effect.finished) {
        this.activeSweatEffects.splice(i, 1)
      }
    }
  }

  /**
   * Trigger blackout effect - lights turn off for 3 seconds
   * If already blacked out, extend the duration
   */
  _triggerBlackout() {
    if (this.isBlackoutActive) {
      // Already blackout, add more time (accumulate for multiple player falls)
      this.blackoutTimer += this.blackoutDuration
      console.debug('[Scene1Manager] Blackout extended, total duration:', this.blackoutTimer)
    } else {
      // Start new blackout
      this.isBlackoutActive = true
      this.blackoutTimer = this.blackoutDuration
      console.debug('[Scene1Manager] Blackout triggered, duration:', this.blackoutDuration)
    }
  }

  /**
   * Update blackout timer and manage blackout state
   */
  _updateBlackout(delta) {
    if (!this.isBlackoutActive) return

    // Delta is in seconds, convert to milliseconds
    const deltaMs = delta * 1000
    this.blackoutTimer -= deltaMs

    if (this.blackoutTimer <= 0) {
      this.isBlackoutActive = false
      this.blackoutTimer = 0
      console.debug('[Scene1Manager] Blackout ended')
    }
  }

  _hookGuyAIControllers(syncList) {
    if (!syncList) return
    syncList.forEach(entry => {
      if (entry.name === 'Guy' && entry.body && entry.body.userData && entry.body.userData.guyAI) {
        const guyAI = entry.body.userData.guyAI
        const guyMesh = entry.mesh
        if (!this.hookedGuyAIs.has(guyAI)) {
          guyAI.onPhaseChange = (newPhase, oldPhase, position) => {
            this.onGuyPhaseChange(newPhase, oldPhase, guyMesh)
          }
          this.hookedGuyAIs.add(guyAI)
        }
      }
    })
  }

  _initializePersonMesh() {
    this.personMesh = this.sceneGroup.getObjectByName("Person")
    if (this.personMesh) {
      this.initialY = this.wElev - 2
      this.targetY = this.initialY - 5
      this.personMesh.position.y = this.targetY
    }
  }

  update(delta, world, syncList, particleManager) {
    // ✨ NEW: Track game start time on first update
    if (!this.gameStartTime) {
      this.gameStartTime = Date.now()
    }
    
    // Don't update game logic if game is already over (not the first time)
    if (this.gameOver && this.gameOverCallbackTriggered) {
      return  // Already triggered, just skip
    }
    
    if (!this.lightsInitialized) {
      this._initializeLightsLazy()
    }
    
    this._updateWaterSplash(delta, particleManager)
    this._updateBlackout(delta)
    this._updateLightFlickerDuration(delta)
    this._updateLightsFlicker()
    this._hookGuyAIControllers(syncList)
    this._updateGuyCount(syncList)
    this._updateAmbientFlicker(delta, syncList)
    this._updateSunLightFlicker()
    this._updatePersonAnimation(delta, syncList)
    
    // ✨ NEW: Update scoring system to track ball destruction
    this._updateScoringSystem(syncList)
    
    // ✨ NEW: Update reset timer for ball sequence
    this._updateBallResetTimer(delta)
    
    // ✨ NEW: Update elevator door (trigger on phase 3, update display)
    this._updateElevatorDoor(delta, syncList)
    
    // ✨ NEW: Check for elevator door collision with player
    this._checkElevatorDoorCollision(syncList)
    
    // ✨ NEW: Update active sweat effects on Compune
    this._updateSweatEffects(delta)
    
    // Check if compune has been destroyed from syncList (DestroySystem removes it)
    // This is more reliable than checking shouldDespawn since DestroySystem can remove it early
    if (this.compuneAI && !this.compuneSpawnedActivated) {
      // Check if compune is still in syncList
      const compuneStillExists = syncList.some(e => e.name === 'Compune')
      
      if (!compuneStillExists) {
        this.ballSpawningActive = true
        this.ballSpawnStartTime = Date.now()
        this.lastBallBatchSpawnTime = Date.now()
        this.compuneSpawnedActivated = true // Only do this once
      }
    }
    
    this._updateBallSpawning(syncList)
    
    // ✨ NEW: CHECK FOR GAME OVER AFTER ALL COLLISIONS (not before!)
    // This triggers callback the SAME frame collision is detected
    if (this.gameOver && this.gameOverCallback && !this.gameOverCallbackTriggered) {
      this.gameOverCallbackTriggered = true
      const completionTime = (Date.now() - this.gameStartTime) / 1000  // Convert to seconds
      console.log('[Scene1Manager] Triggering callback - reason:', this.gameOverReason, 'time:', completionTime, 'callback:', !!this.gameOverCallback)
      this.gameOverCallback(this.gameOverReason, completionTime)
    }
  }

  _initializeLightsLazy() {
    if (this.mainScene) {
      this.mainScene.traverse(child => {
        if (child.isLight && child instanceof THREE.AmbientLight) {
          this.ambientLight = child
          this.baseAmbientIntensity = child.intensity
          this.currentAmbientIntensity = child.intensity
        }
      })
    }
    
    this.sceneGroup.traverse(child => {
      if (child.isLight && child instanceof THREE.SpotLight) {
        this.sunLight = child
        this.baseSunIntensity = child.intensity
      }
    })
    
    this.lightsInitialized = true
  }

  _updateAmbientFlicker(delta, syncList) {
    if (!this.ambientLight) {
      return
    }

    const timersToDelete = []
    this.guyFlickerTimers.forEach((remainingTime, guyMesh) => {
      remainingTime -= delta
      if (remainingTime <= 0) {
        timersToDelete.push(guyMesh)
      } else {
        this.guyFlickerTimers.set(guyMesh, remainingTime)
      }
    })
    timersToDelete.forEach(mesh => this.guyFlickerTimers.delete(mesh))
    
    // Update ball event flickering timer
    if (this.ballEventFlickerTimer > 0) {
      this.ballEventFlickerTimer -= delta
    }
    
    // Ambient flickering active if any guy is flickering or ball event is flickering
    this.isAmbientFlickering = this.guyFlickerTimers.size > 0 || this.ballEventFlickerTimer > 0
    
    // Ambient light remains steady - no flickering
    if (this.isBlackoutActive) {
      this.ambientLight.intensity = SCENE1_CONFIG.blackoutAmbientIntensity
    } else {
      // Keep ambient light at steady intensity regardless of emergency/phase changes
      this.ambientLight.intensity = this.currentAmbientIntensity
    }
    
    if (this.mainScene && this.mainScene.fog && this.mainScene.fog instanceof THREE.Fog) {
      const baseFar = SCENE1_CONFIG.sunLightBaseFar
      const reducedFar = baseFar - (this.totalPhaseChanges * 15)
      this.mainScene.fog.far = Math.max(5, reducedFar)
    }
  }

  _updateWaterSplash(delta, particleManager) {
    if (!particleManager) return
    
    this.leakTimer += delta
    if (this.leakTimer > SCENE1_CONFIG.waterSplashInterval) {
      const cfg = SCENE1_CONFIG.waterSplashPosition
      const baseX = cfg.x
      const baseY = cfg.y
      const baseZ = cfg.z
      
      const randomX = baseX + (Math.random() - 0.5) * SCENE1_CONFIG.waterSplashSpread
      const randomY = baseY + (Math.random() - 0.3) * SCENE1_CONFIG.waterSplashRandomY
      const randomZ = baseZ + (Math.random() - 0.5) * SCENE1_CONFIG.waterSplashSpread
      
      const spawnCount = Math.random() > 0.5 ? 3 : 2
      for (let i = 0; i < spawnCount; i++) {
        const offsetX = randomX + (Math.random() - 0.5) * 0.4
        const offsetY = randomY + (Math.random() - 0.5) * 0.3
        const offsetZ = randomZ + (Math.random() - 0.5) * 0.4
        particleManager.spawn('waterSplash', new THREE.Vector3(offsetX, offsetY, offsetZ))
      }
      
      this.leakTimer = 0
    }
  }

  _updateLightsFlicker() {
    // If blackout is active, turn off all lights completely
    if (this.isBlackoutActive) {
      this.sceneGroup.children.forEach(child => {
        if (!child.userData || !child.userData.lightSource) {
          return
        }
        child.userData.lightSource.intensity = 0

        child.children.forEach(mesh => {
          if (mesh.isMesh && mesh.material && mesh.material.emissive) {
            if (mesh.material.emissive.getHex() > 0) {
              mesh.material.emissiveIntensity = FLICKER_CONFIG.offEmissiveIntensity
              mesh.material.color.set(FLICKER_CONFIG.offColor)
            }
          }
        })
      })
      return
    }

    if (!this.isLightFlickeringActive) return

    this.sceneGroup.children.forEach(child => {
      if (!child.userData || !child.userData.lightSource) {
        return
      }

      if (Math.random() > 0.4) {
        const rand = Math.random()
        let newIntensity = 0

        if (rand < 0.3) {
          newIntensity = 0
        } else if (rand < 0.6) {
          newIntensity = Math.random() * 0.5
        } else {
          newIntensity = 1.0 + (Math.random() - 0.5) * 1.5
        }

        child.userData.lightSource.intensity = newIntensity

        child.children.forEach(mesh => {
          if (mesh.isMesh && mesh.material && mesh.material.emissive) {
            if (mesh.material.emissive.getHex() > 0) {
              if (newIntensity < 0.1) {
                mesh.material.emissiveIntensity = FLICKER_CONFIG.offEmissiveIntensity
                mesh.material.color.set(FLICKER_CONFIG.offColor)
              } else {
                mesh.material.emissiveIntensity = newIntensity * FLICKER_CONFIG.onEmissiveIntensityMultiplier
                mesh.material.color.set(FLICKER_CONFIG.onColor)
              }
            }
          }
        })
      }
    })
  }

  _updatePersonAnimation(delta, syncList) {
    if (!this.personMesh || !this.personMesh.userData.triggerShape || !syncList) {
      return
    }

    const personHeight = SCENE1_CONFIG.personHeight
    const hitboxCenter = this.personMesh.position.clone().setY(
      this.personMesh.position.y + personHeight / 2
    )
    const hitboxRadius = this.personMesh.userData.triggerShape.radius

    let triggered = false
    const dynamicEntries = syncList.filter(entry => entry.body && entry.body.mass > 0)

    for (const entry of dynamicEntries) {
      if (entry.mesh && hitboxCenter.distanceTo(entry.mesh.position) < hitboxRadius) {
        triggered = true
        break
      }
    }

    if (triggered) {
      if (!this.isRetracting) {
        this.isRetracting = true
        this.targetY = this.initialY - 5
        this.riseProgress = 0
      }
    } else {
      this.isRetracting = false
    }

    if (this.isRetracting) {
      const yDistance = this.targetY - this.personMesh.position.y
      if (Math.abs(yDistance) > 0.01) {
        this.personMesh.position.y += yDistance * 0.2
      } else {
        this.personMesh.position.y = this.targetY
      }
    } else {
      if (this.personMesh.position.y < this.initialY) {
        const riseDuration = 20
        this.riseProgress += delta
        const riseSpeed = (this.initialY - (this.initialY - 5)) / riseDuration
        const newY = (this.initialY - 5) + (riseSpeed * this.riseProgress)
        this.personMesh.position.y = Math.min(newY, this.initialY)
      }
    }
  }

  onGuyPhaseChange(newPhase, oldPhase, guyMesh) {
    this._triggerFlickerLights()
    this.guyFlickerTimers.set(guyMesh, SCENE1_CONFIG.ambientLightFlickerDuration)
    
    this.totalPhaseChanges++
    this.currentAmbientIntensity = Math.max(
      0.1,
      this.baseAmbientIntensity - (this.totalPhaseChanges * this.phaseChangeIntensityReduction)
    )
    this.currentFogDensity = this.baseFogDensity + (this.totalPhaseChanges * this.phaseChangeFogIncrease)
  }

  _triggerFlickerLights() {
    this.isLightFlickeringActive = true
    this.lightFlickerTimer = 0
  }

  _updateSunLightFlicker() {
    if (!this.sunLight) {
      return
    }

    // If blackout is active, keep minimal sun light (light from window)
    if (this.isBlackoutActive) {
      this.sunLight.intensity = SCENE1_CONFIG.blackoutSunLightIntensity
      return
    }

    const reducedIntensity = this.baseSunIntensity * (SCENE1_CONFIG.sunLightDimFactor ** this.totalPhaseChanges)

    if (!this.isAmbientFlickering) {
      this.sunLight.intensity = reducedIntensity
      return
    }

    if (Math.random() > 0.5) {
      this.sunLight.intensity = SCENE1_CONFIG.sunLightMinIntensity
    } else {
      this.sunLight.intensity = reducedIntensity
    }
  }

  _updateGuyCount(syncList) {
    const guys = syncList.filter(e => e.name === 'Guy' && e.mesh)
    this.guyCount = guys.length

    if (this.lastGuyCount > 0 && this.guyCount === 0) {
      this._resetSceneEffects()
    }

    this.lastGuyCount = this.guyCount
  }

  _resetSceneEffects() {
    this.isLightFlickeringActive = false
    this.lightFlickerTimer = 0
    this.isAmbientFlickering = false
    this.guyFlickerTimers.clear()

    this.totalPhaseChanges = 0
    this.currentAmbientIntensity = this.baseAmbientIntensity
    this.currentFogDensity = this.baseFogDensity

    if (this.ambientLight) {
      this.ambientLight.intensity = this.baseAmbientIntensity
    }

    if (this.sunLight) {
      this.sunLight.intensity = this.baseSunIntensity
    }

    if (this.mainScene && this.mainScene.fog && this.mainScene.fog instanceof THREE.Fog) {
      this.mainScene.fog.far = SCENE1_CONFIG.sunLightBaseFar
    }
  }

  _updateLightFlickerDuration(delta) {
    if (!this.isLightFlickeringActive) return

    this.lightFlickerTimer += delta
    if (this.lightFlickerTimer >= SCENE1_CONFIG.lightFlickerDuration) {
      this.isLightFlickeringActive = false
      this.lightFlickerTimer = 0
    }
  }

  /**
   * ✨ NEW: Track ball destruction and scoring system
   * Expects balls to be destroyed in sequence: 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8
   * If correct order, increase score and log. If wrong order, reset all.
   */
  _updateScoringSystem(syncList) {
    // Build current set of ball names in syncList
    const currentBallNames = new Set()
    const currentBallMap = new Map() // Ball name -> userData.ballNumber
    
    syncList.forEach(entry => {
      if (entry.name && entry.name.startsWith('Ball ')) {
        currentBallNames.add(entry.name)
        // Track which ball number this is
        if (entry.userData && typeof entry.userData.ballNumber === 'number') {
          currentBallMap.set(entry.name, entry.userData.ballNumber)
        }
      }
    })

    // Check if any balls were destroyed (in previousBallNames but not in currentBallNames)
    this.previousBallNames.forEach(ballName => {
      if (!currentBallNames.has(ballName)) {
        // This ball was destroyed!
        const ballNumber = currentBallMap.has(ballName) ? currentBallMap.get(ballName) : null
        
        // Find ball number from currentBatchBalls (in case it wasn't in map)
        if (ballNumber === null) {
          const destroyedBall = this.currentBatchBalls.find(b => b.name === ballName)
          if (destroyedBall && destroyedBall.userData && typeof destroyedBall.userData.ballNumber === 'number') {
            this._onBallDestroyed(destroyedBall.userData.ballNumber)
          } else {
            console.warn(`[Scoring] Ball destroyed but couldn't determine number: ${ballName}`)
          }
        } else {
          this._onBallDestroyed(ballNumber)
        }
      }
    })

    // Update previousBallNames for next frame
    this.previousBallNames = currentBallNames
  }

  /**
   * ✨ NEW: Called when a ball is destroyed
   * Check if it matches expected destroy sequence
   */
  _onBallDestroyed(ballNumber) {
    if (this.nextExpectedBallIndex >= this.destroySequence.length) {
      console.warn(`[Scoring] Ball ${ballNumber} destroyed but all balls should be done!`)
      return
    }

    const expectedBall = this.destroySequence[this.nextExpectedBallIndex]
    
    if (ballNumber === expectedBall) {
      // ✨ CORRECT ORDER!
      this.currentScore++
      console.log(`%c[SCORING] ✓ Correct! Ball ${ballNumber} destroyed. Score: ${this.currentScore}/${this.destroySequence.length}`, 'color: #00ff00; font-weight: bold; font-size: 14px')
      this.nextExpectedBallIndex++
      
      // ✨ NEW: If ball 7 destroyed, trigger comprehensive flickering effect
      if (ballNumber === 7) {
        this._triggerFlickerLights()
        this.ballEventFlickerTimer = SCENE1_CONFIG.ambientLightFlickerDuration
        console.log(`%c[EFFECT] Ball 7 destroyed! Triggering comprehensive flickering effect...`, 'color: #ffaa00; font-weight: bold')
      }
      
      // Check if all balls destroyed in correct order
      if (this.nextExpectedBallIndex >= this.destroySequence.length) {
        console.log(`%c[SCORING] 🎉 PERFECT! All ${this.destroySequence.length} balls destroyed in correct order!`, 'color: #ffff00; font-weight: bold; font-size: 16px')
      }
    } else {
      // ✨ WRONG ORDER - RESET!
      console.log(`%c[SCORING] ✗ WRONG! Expected Ball ${expectedBall}, got Ball ${ballNumber}. RESET!`, 'color: #ff0000; font-weight: bold; font-size: 14px')
      console.log(`%c[SCORING] Score reset from ${this.currentScore} to 0`, 'color: #ff6600; font-weight: bold')
      this.currentScore = 0
      this.nextExpectedBallIndex = 0
      
      // ✨ NEW: Trigger comprehensive flickering effect on reset
      this._triggerFlickerLights()
      this.ballEventFlickerTimer = SCENE1_CONFIG.ambientLightFlickerDuration
      console.log(`%c[EFFECT] Score reset! Triggering comprehensive flickering effect...`, 'color: #ff0066; font-weight: bold')
      
      // Trigger reset: despawn all balls and respawn after 3 seconds
      this._triggerBallSequenceReset()
    }
  }

  /**
   * ✨ NEW: Reset ball sequence after wrong destruction order
   * Despawn all current balls and respawn from ball 1
   */
  _triggerBallSequenceReset() {
    if (this.isResetActive) return
    
    console.log(`%c[Reset] Starting ball sequence reset!`, 'color: #ff3300; font-weight: bold; font-size: 12px')
    console.log(`[Reset] currentBatchBalls length: ${this.currentBatchBalls.length}`)
    console.log(`[Reset] destroySystem: ${this.destroySystem ? 'EXISTS' : 'NULL'}`)
    
    this.isResetActive = true
    this.resetTimer = 3000 // 3 seconds in milliseconds
    
    // Despawn all balls in currentBatchBalls
    this.currentBatchBalls.forEach(ballEntry => {
      if (ballEntry) {
        const ballNum = ballEntry.userData?.ballNumber || '?'
        console.log(`[Reset] Processing ball ${ballNum}: ${ballEntry.name}`)
        
        if (this.destroySystem) {
          console.log(`[Reset] ✓ Despawning ball ${ballNum}: ${ballEntry.name}`)
          this.destroySystem.destroyObject(ballEntry)
        } else {
          console.warn(`[Reset] ✗ destroySystem is NULL, cannot despawn ball ${ballNum}: ${ballEntry.name}`)
        }
      }
    })
    
    this.currentBatchBalls = []
    console.log(`%c[Reset] All balls despawned. Respawning in 3 seconds...`, 'color: #ff6600; font-weight: bold')
  }

  /**
   * ✨ NEW: Update reset timer and respawn when ready
   */
  _updateBallResetTimer(delta) {
    if (!this.isResetActive) return
    
    this.resetTimer -= delta * 1000 // Convert delta to milliseconds
    
    if (this.resetTimer <= 0) {
      // Reset timer expired - respawn sequence
      this.isResetActive = false
      this.ballBatchIndex = 0
      this.allBallsSpawned = false
      this.ballSpawningActive = true
      console.log(`%c[Reset] Sequence reset! Respawning balls from Ball 1...`, 'color: #0088ff; font-weight: bold')
    }
  }

  disableFlickering() {
    this.sceneGroup.children.forEach(child => {
      if (child.userData) {
        child.userData.isFlickering = false
      }
    })
  }

  enableFlickering() {
    this.sceneGroup.children.forEach(child => {
      if (child.userData && child.userData.lightSource) {
        child.userData.isFlickering = true
      }
    })
  }

  setPersonVisible(visible) {
    if (this.personMesh) {
      this.personMesh.visible = visible
    }
  }

  /**
   * Update ball spawning system
   * Spawn next batch only when all balls in current batch have despawned
   */
  _updateBallSpawning(syncList) {
    // ✨ NEW: Don't spawn new balls if reset is active (waiting to respawn)
    if (this.isResetActive) {
      return
    }
    
    if (!this.ballSpawningActive) {
      return
    }

    // Wait for current batch spawning to be scheduled before checking for despaws
    if (!this.currentBatchSpawningComplete) {
      return
    }

    // Check if any balls from current batch still exist in syncList
    const remainingBalls = syncList.filter(e =>
      this.currentBatchBalls.some(b => b.name === e.name)
    )

    // Spawn next batch if:
    // 1. First batch (ballBatchIndex === 0 and currentBatchBalls is empty), OR
    // 2. All balls from current batch have despawned
    const shouldSpawnNext = (this.ballBatchIndex === 0 && this.currentBatchBalls.length === 0) || 
                           (this.currentBatchBalls.length > 0 && remainingBalls.length === 0)
    
    if (shouldSpawnNext) {
      if (this.ballBatchIndex < this.ballSpawnSequence.length) {
        // Still more balls to spawn in sequence
        this._spawnNextBallBatch(syncList)
      } else if (!this.allBallsSpawned) {
        // All regular balls spawned, spawn ball 8 immediately in front of player
        this._spawnBall8(syncList)
        this.allBallsSpawned = true
        this.ballSpawningActive = false
      }
    }
  }

  /**
   * Spawn next batch of 1-3 balls with random delays (0-5 seconds between each)
   */
  _spawnNextBallBatch(syncList) {
    if (this.ballBatchIndex >= this.ballSpawnSequence.length) return

    // Mark that we're scheduling spawns for this batch
    this.currentBatchSpawningComplete = false
    
    // Determine batch size (1-3 balls)
    const batchSize = Math.floor(Math.random() * 3) + 1
    this.currentBatchBalls = []

    for (let i = 0; i < batchSize && this.ballBatchIndex < this.ballSpawnSequence.length; i++) {
      const ballNumber = this.ballSpawnSequence[this.ballBatchIndex]
      // Random delay 0-5 seconds before spawning each ball
      const delay = Math.random() * 5000
      setTimeout(() => {
        this._spawnSingleBall(ballNumber, syncList)
      }, delay)
      this.ballBatchIndex++
    }
    
    // Mark that all spawns for this batch have been scheduled
    this.currentBatchSpawningComplete = true
  }

  /**
   * Spawn a single ball by number
   */
  _spawnSingleBall(ballNumber, syncList) {
    import('../assets/objects/BallFactory.js').then(module => {
      const ballAssets = module.getBallAssets(this.renderer)
      
      if (!ballAssets || ballAssets.length === 0) {
        console.error('[Scene1Manager] Could not load ball assets')
        return
      }

      // Find asset for this ball number
      const ballAsset = ballAssets.find(a => a.name === `Ball ${ballNumber}`)
      
      if (!ballAsset) {
        console.error('[Scene1Manager] Could not find ball asset for number:', ballNumber)
        return
      }

      // Calculate spawn position - slightly narrower area than typical simulator
      const tableWidth = 20
      const tableDepth = 11
      const shrinkFactor = 0.7 // Narrower spawn area
      const halfW = (tableWidth / 2) * shrinkFactor
      const halfD = (tableDepth / 2) * shrinkFactor
      const x = (Math.random() * 2 - 1) * halfW
      const z = (Math.random() * 2 - 1) * halfD
      
      // Get table top Y position
      const table = this.sceneGroup.getObjectByName("Billiard Table")
      let baseY = 0
      if (table && table.userData && table.userData.tableDimensions && table.userData.tableDimensions.topY) {
        baseY = table.userData.tableDimensions.topY
      }
      
      const spawnPos = new THREE.Vector3(x, baseY + 7, z)

      // Create ball asset object that matches prefab interface
      // Wrap factory to include shadow config for fake shadow system
      const ballPrefab = {
        name: ballAsset.name,
        type: 'dynamic',
        createMesh: () => {
          const mesh = ballAsset.factory()
          // Add shadow config for FakeShadowManager in SimulationTest
          mesh.userData.shadowConfig = { size: 1.0, opacity: 0.6, fadeRate: 0.5 }
          return mesh
        },
        createBody: (physicsMaterials) => {
          // Extract radius from physics shapes definition
          const ballShape = ballAsset.physics.shapes[0]
          const radius = ballShape ? ballShape.radius : 0.25
          
          const body = new CANNON.Body({
            mass: ballAsset.physics.mass,
            collisionFilterGroup: COLLISION_GROUPS.BALL,
            collisionFilterMask: COLLISION_MASKS.BALL,
            material: physicsMaterials?.ball || undefined,  // Use ball physics material
            linearDamping: ballAsset.physics.linearDamping || 0.1,
            angularDamping: ballAsset.physics.angularDamping || 0.8
          })
          body.addShape(new CANNON.Sphere(radius))
          return body
        }
      }

      // Spawn the ball
      this.spawner({
        scene: this.mainScene,
        prefab: ballPrefab,
        position: spawnPos,
        world: this.world,
        physicsMaterials: this.physicsMaterials,
        syncList: this.syncList,
        particleManager: this.particleManager
      })

      // Track this ball
      const ballEntry = this._findLastSpawnedBall(syncList)
      if (ballEntry) {
        ballEntry.userData = ballEntry.userData || {}
        ballEntry.userData.ballNumber = ballNumber
        this.currentBatchBalls.push(ballEntry)
        
        // Apply random rotation to the ball
        this._applyRandomRotation(ballEntry)
      }
    }).catch(err => {
      console.error('[Scene1Manager] Error loading ball assets:', err)
    })
  }

  /**
   * Spawn ball 8 in front of player
   */
  _spawnBall8(syncList) {
    import('../assets/objects/BallFactory.js').then(module => {
      const ballAssets = module.getBallAssets(this.renderer)
      
      if (!ballAssets || ballAssets.length === 0) {
        console.warn('[Scene1Manager] Could not load ball assets for ball 8')
        return
      }

      const ballAsset = ballAssets.find(a => a.name === 'Ball 8')
      
      if (!ballAsset) {
        console.warn('[Scene1Manager] Could not find ball 8 asset')
        return
      }

      // ✨ FIXED: Spawn ball 8 same way as other balls (random position on table)
      // Calculate spawn position - slightly narrower area like other balls
      const tableWidth = 20
      const tableDepth = 11
      const shrinkFactor = 0.7 // Narrower spawn area (same as _spawnSingleBall)
      const halfW = (tableWidth / 2) * shrinkFactor
      const halfD = (tableDepth / 2) * shrinkFactor
      const x = (Math.random() * 2 - 1) * halfW
      const z = (Math.random() * 2 - 1) * halfD
      
      // Get table top Y position
      const table = this.sceneGroup.getObjectByName("Billiard Table")
      let baseY = 0
      if (table && table.userData && table.userData.tableDimensions && table.userData.tableDimensions.topY) {
        baseY = table.userData.tableDimensions.topY
      }
      
      const spawnPos = new THREE.Vector3(x, baseY + 7, z)

      // Create ball prefab object
      // Wrap factory to include shadow config for fake shadow system
      const ballPrefab = {
        name: ballAsset.name,
        type: 'dynamic',
        createMesh: () => {
          const mesh = ballAsset.factory()
          // Add shadow config for FakeShadowManager in SimulationTest
          mesh.userData.shadowConfig = { size: 1.0, opacity: 0.6, fadeRate: 0.5 }
          return mesh
        },
        createBody: (physicsMaterials) => {
          // Extract radius from physics shapes definition
          const ballShape = ballAsset.physics.shapes[0]
          const radius = ballShape ? ballShape.radius : 0.25
          
          const body = new CANNON.Body({
            mass: ballAsset.physics.mass,
            shape: new CANNON.Sphere(radius)
          })
          return body
        }
      }

      // Spawn ball 8
      this.spawner({
        scene: this.mainScene,
        prefab: ballPrefab,
        position: spawnPos,
        world: this.world,
        physicsMaterials: this.physicsMaterials,
        syncList: this.syncList,
        particleManager: this.particleManager
      })

      // Find and apply random rotation to ball 8
      const ball8Entry = this._findLastSpawnedBall(this.syncList)
      if (ball8Entry) {
        // ✨ NEW: Set ballNumber for scoring system
        ball8Entry.userData = ball8Entry.userData || {}
        ball8Entry.userData.ballNumber = 8
        this._applyRandomRotation(ball8Entry)
        
        // ✨ CRITICAL: Add ball 8 to tracking so it can be detected when destroyed
        this.currentBatchBalls.push(ball8Entry)
      }

      console.log('[Scene1Manager] Ball 8 spawned at random position on table')
    }).catch(err => {
      console.error('[Scene1Manager] Error loading ball 8 asset:', err)
    })
  }

  /**
   * Find the last spawned ball in syncList
   */
  _findLastSpawnedBall(syncList) {
    for (let i = syncList.length - 1; i >= 0; i--) {
      const entry = syncList[i]
      if (entry.type === 'dynamic' && entry.name && entry.name.includes('Ball')) {
        return entry
      }
    }
    return null
  }

  /**
   * Apply random rotation to a ball's mesh and body
   * Gives visual/physical rotation when spawned
   */
  _applyRandomRotation(ballEntry) {
    if (!ballEntry) return
    
    // Random rotation using quaternion (smoother than Euler angles)
    const randomX = Math.random() * Math.PI * 2
    const randomY = Math.random() * Math.PI * 2
    const randomZ = Math.random() * Math.PI * 2
    
    // Apply rotation to mesh
    if (ballEntry.mesh) {
      ballEntry.mesh.rotation.set(randomX, randomY, randomZ)
    }
    
    // Apply angular velocity to physics body (optional - makes it spin)
    if (ballEntry.body) {
      // Random angular velocity on each axis
      const angularVelX = (Math.random() - 0.5) * 10
      const angularVelY = (Math.random() - 0.5) * 10
      const angularVelZ = (Math.random() - 0.5) * 10
      
      ballEntry.body.angularVelocity.set(angularVelX, angularVelY, angularVelZ)
    }
  }

  /**
   * ✨ Get the value to display on elevator (either currentScore or countdown value)
   */
  _getElevatorDisplayValue() {
    // If countdown finished, keep displaying 0
    if (this.elevatorCountdownFinished && this.elevatorFinalDisplayValue !== null) {
      return this.elevatorFinalDisplayValue
    }
    
    if (this.elevatorCountdownActive) {
      // During countdown: calculate value from 15 down to 0
      const progress = this.elevatorCountdownTimer / this.elevatorCountdownDuration // 0 to 1
      const countdownValue = Math.max(0, Math.round(15 * (1 - progress)))
      return countdownValue
    }
    return this.currentScore
  }

  /**
   * ✨ NEW: Update elevator door system
   * - Trigger opening when any guy reaches phase 4+
   * - Update display with current ball destruction count (0-14) or countdown (15-0)
   * - Start countdown when score reaches 15
   * - Animate door and interior light
   */
  _updateElevatorDoor(delta, syncList) {
    // Find elevator door if not already cached
    if (!this.elevatorDoor) {
      this.elevatorDoor = this.sceneGroup.getObjectByName('Elevator Door')
    }

    if (!this.elevatorDoor) {
      return
    }

    // ✨ NEW: Start countdown when score reaches 15 and any guy exists
    const guys = syncList.filter(e => e.name === 'Guy' && e.body && e.body.userData && e.body.userData.guyAI)
    if (this.currentScore >= 15 && guys.length > 0 && !this.elevatorCountdownActive) {
      this.elevatorCountdownActive = true
      this.elevatorCountdownTimer = 0
      console.log(`%c[Elevator] Score 15 reached + Guy spawned! Starting 50-second countdown...`, 'color: #00ff88; font-weight: bold')
    }

    // ✨ NEW: Update countdown timer
    if (this.elevatorCountdownActive) {
      this.elevatorCountdownTimer += delta
      if (this.elevatorCountdownTimer >= this.elevatorCountdownDuration) {
        this.elevatorCountdownActive = false
        this.elevatorCountdownTimer = 0
        this.elevatorCountdownFinished = true // Mark as finished
        this.elevatorFinalDisplayValue = 0 // Keep displaying 0
        console.log(`%c[Elevator] Countdown complete! Opening door now...`, 'color: #ffff00; font-weight: bold')
        
        // ✨ FIXED: Open door only when countdown finishes
        if (this.elevatorDoor.userData.animationState) {
          this.elevatorDoor.userData.animationState.isOpening = true
          this.elevatorDoor.userData.animationState.openStartTime = Date.now()
        }
        console.log(`%c[Elevator] Door opening triggered! Countdown finished!`, 'color: #00ddff; font-weight: bold')
      }
    }

    // ✨ NEW: Update display with current score OR countdown value
    const displayValue = this._getElevatorDisplayValue()
    let displayMesh = null
    this.elevatorDoor.traverseVisible(child => {
      if (child.userData && typeof child.userData.updateDisplay === 'function') {
        displayMesh = child
      }
    })
    if (displayMesh && displayMesh.userData.updateDisplay) {
      // Pass countdown flag so display can color accordingly
      displayMesh.userData.updateDisplay(displayValue, this.elevatorCountdownActive)
    }

    // Update door animation directly on the cloned instance
    this._updateElevatorAnimation(delta)
  }

  /**
   * ✨ Update elevator door animation directly on the instance
   */
  _updateElevatorAnimation(delta) {
    if (!this.elevatorDoor || !this.elevatorDoor.userData.animationState) return

    const animState = this.elevatorDoor.userData.animationState
    if (!animState.isOpening) return

    const elapsed = Date.now() - animState.openStartTime
    const durationMs = 1.5 * 1000  // ELEVATOR_CONFIG.animationDuration = 1.5s
    animState.openProgress = Math.min(elapsed / durationMs, 1.0)

    // Find door panel and glow plane
    const doorPanel = this.elevatorDoor.children.find(c => c.userData.isDoorPanel)
    const glowPlane = this.elevatorDoor.children.find(c => c.userData.isGlowPlane)
    const environmentLight = this.elevatorDoor.children.find(c => c.userData.isEnvironmentLight)

    if (doorPanel) {
      // ✨ Ép chiều rộng cửa từ 1 → 0 về một bên (từ phải sang trái)
      doorPanel.scale.z = 1 - animState.openProgress
      // Adjust position to keep left edge fixed, compress from right
      doorPanel.position.z = -animState.openProgress * (3.8 / 2)  // doorWidth = 3.8
      // Also fade out door slightly
      doorPanel.material.opacity = 0.9 * (1 - animState.openProgress)
    }

    if (glowPlane) {
      // Increase glow intensity - glow plane emits light, doesn't cast it
      // Sáng dần từ 0 → 5 khi mở cửa
      glowPlane.material.emissiveIntensity = 5 * animState.openProgress
    }

    // ✨ NEW: Animate environment light (cast light onto surroundings when door opens)
    if (environmentLight) {
      const maxLightIntensity = 800 // ✨ Reduced from 2500 (less bright)
      environmentLight.intensity = maxLightIntensity * animState.openProgress
    }

    // Animation complete
    if (animState.openProgress >= 1.0) {
      animState.isOpening = false
      animState.isOpen = true
    }
  }

  /**
   * ✨ NEW: Check for collision between player and elevator door
   * Detects when player touches the open elevator door
   */
  _checkElevatorDoorCollision(syncList) {
    // Find elevator door if not cached
    if (!this.elevatorDoor) {
      this.elevatorDoor = this.sceneGroup.getObjectByName('Elevator Door')
    }

    if (!this.elevatorDoor) return

    // Check if door is open
    const animState = this.elevatorDoor.userData.animationState
    if (!animState || !animState.isOpen) return

    // Find player in syncList
    const playerEntry = syncList.find(e => e.name === 'Player')
    if (!playerEntry || !playerEntry.mesh) return

    // Get positions
    const playerPos = playerEntry.mesh.position
    const doorPos = this.elevatorDoor.position

    // Calculate distance between player and door center
    const distance = playerPos.distanceTo(doorPos)

    // Collision threshold (door dimensions: width 3.8, height 5.0, depth 0.2)
    // We use a generous collision radius of 3 units
    const collisionRadius = 3.0

    if (distance < collisionRadius) {
      // Player touched the open elevator door!
      console.log('Đã tới thang máy!')
      console.log('[Scene1Manager] Elevator collision detected. gameOver before:', this.gameOver)
      
      // ✨ NEW: Mark game as over with elevator completion
      if (!this.gameOver) {
        this.gameOver = true
        this.gameOverReason = 'elevator'
        console.log('[Scene1Manager] Set gameOver=true with reason=elevator')
      } else {
        console.log('[Scene1Manager] gameOver already true, skipping')
      }
      
      // Reset flag to log only once per door open
      if (!this.elevatorDoorTouched) {
        this.elevatorDoorTouched = true
        // Optional: Can add additional logic here (e.g., level complete, spawn next scene, etc.)
      }
    } else {
      // Reset flag when player moves away
      this.elevatorDoorTouched = false
    }
  }

  /**
   * ✨ NEW: Called when player is destroyed (despawned)
   */
  onPlayerDestroyed() {
    if (!this.gameOver) {
      this.gameOver = true
      this.gameOverReason = 'death'
    }
  }

  reset() {
    this.flickerTimer = 0
    this.leakTimer = 0
    this.riseProgress = 0
    this.isRetracting = false
    this.ambientLightFlickerTimer = 0
    this.isAmbientFlickering = false
    this.guyFlickerTimers.clear()
    this.hookedGuyAIs.clear()
    this.totalPhaseChanges = 0
    this.currentAmbientIntensity = this.baseAmbientIntensity
    this.currentFogDensity = this.baseFogDensity
    
    // ✨ NEW: Reset game over state
    this.gameOver = false
    this.gameStartTime = null
    this.gameOverReason = null
    this.gameOverCallback = null
    this.gameOverCallbackTriggered = false
    
    // ✨ Reset elevator door state
    this.elevatorDoor = null
    this.elevatorDoorOpened = false
    this.elevatorDoorPhaseTriggered = false
    this.elevatorCountdownActive = false
    this.elevatorCountdownTimer = 0
    this.elevatorCountdownFinished = false
    this.elevatorFinalDisplayValue = null
    
    // Reset ball spawning state
    this.playerSpawned = false
    this.sceneStartTime = 0
    this.compuneAI = null
    this.compuneMesh = null
    this.ballSpawnStartTime = 0
    this.ballBatchIndex = 0
    this.currentBatchBalls = []
    this.ballSpawningActive = false
    this.allBallsSpawned = false
    this.currentBatchSpawningComplete = true
    
    // ✨ NEW: Reset scoring system
    this.nextExpectedBallIndex = 0
    this.currentScore = 0
    this.resetTimer = 0
    this.isResetActive = false
    this.previousBallNames.clear()
    
    // ✨ NEW: Reset sweat effects
    this.activeSweatEffects = []
    this.lastEnterPressTime = 0
    
    if (this.personMesh) {
      this.personMesh.position.y = this.targetY
    }
    if (this.ambientLight) {
      this.ambientLight.intensity = this.baseAmbientIntensity
    }
    if (this.mainScene && this.mainScene.fog) {
      this.mainScene.fog.density = this.baseFogDensity
    }
  }
}
