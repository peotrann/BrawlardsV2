import * as THREE from "three"
import * as CANNON from "cannon-es"
import { COLLISION_GROUPS, COLLISION_MASKS, detectCueTouchingBalls, OBJECT_MASSES } from "../physics/physicsHelper.js"
import { CollisionManager } from "../utils/collisionManager.js"
import { createImpactRingEffect } from "../effects/particles/particle7.js"

// =============================================
const PLAYER_CONFIG = {
    maxSpeed: 5,
    acceleration: 10,
    jumpHeight: 1.5,
    maxSlopeAngle: 45,
    fixedTimeStep: 1 / 60,
    walkSpeed: 8,
    maxLegSwing: THREE.MathUtils.degToRad(45),
    chargeSpeed: 1.5,
    releaseSpeed: 10,
    maxCharge: 1,
    minForce: 0.005,
    maxForce: 0.05,
    forceMultiplier: 10,
    shotCooldown: 0.5,
    maxHeadYaw: THREE.MathUtils.degToRad(90),
    maxHeadPitch: THREE.MathUtils.degToRad(60),
    pitchSmooth: 0.3,
    bodyRotationSmooth: 5,
    showHitboxes: true,
    hitboxColor: 0xff4444,
    hitboxOpacity: 0.3,
    baseHitboxLength: 0.2,
    baseHitboxRadius: 0.1,
    hitboxLengthMultiplier: 2.5,
    hitboxRadiusMultiplier: 0.1,
    effectRadius: 0.001,
    effectRadiusMultiplier: 0.8,
    effectLength: 1.5,
    effectLengthMultiplier: 2.5,
    keys: {
        forward: "KeyW",
        backward: "KeyS", left: "KeyA", right: "KeyD",
        jump: "Space",
        charge: "KeyE",
    }
}

export class PlayerMovementController {
    constructor(camera, scene, physicsMaterials, canvas = null, syncList = null, destroySystem = null) {
        this.camera = camera
        this.scene = scene
        this.physicsMaterials = physicsMaterials
        this.canvas = canvas
        this.syncList = syncList
        this.destroySystem = destroySystem
        this.particleManager = null  // Will be set later

        this.keys = {
            w: false, a: false, s: false, d: false
        }
        this.jumpPressed = false
        this.canJump = false
        this.canAcceptInput = true
        this._inputDisabled = false
        
        this._isCharging = false
        this.chargeStartTime = 0
        this.currentCharge = 0
        this.lastShotTime = 0

        this.maxSlopeDot = Math.cos(THREE.MathUtils.degToRad(PLAYER_CONFIG.maxSlopeAngle))

        this.walkTime = 0
        this.bodyYaw = 0
        this.currentPitch = 0

        this.cueBody = null
        this.forceBody = null
        this.cueActive = false
        this.currentCuePivot = null
        this.moveDir = new THREE.Vector3()

        this.particleEffects = []
        this.globalShowHitboxes = PLAYER_CONFIG.showHitboxes
        this.currentMesh = null
        this.currentBody = null

        this._setupEventListeners()
    }

    /**
     * Set the syncList and destroySystem for Ball 8 destruction on cue stroke
     */
    setSyncListAndDestroySystem(syncList, destroySystem) {
        this.syncList = syncList;
        this.destroySystem = destroySystem;
    }

    /**
     * Set the particleManager for spawning effects
     */
    setParticleManager(particleManager) {
        this.particleManager = particleManager;
    }

    _setupEventListeners() {
        window.addEventListener("keydown", this._onKeyDown.bind(this))
        window.addEventListener("keyup", this._onKeyUp.bind(this))
        
        const updateInputFlag = () => {
            const activeElement = document.activeElement
            const isOnCanvas = activeElement === this.canvas
            const isOnBody = activeElement === document.body
            const isOnHTML = activeElement === document.documentElement
            
            this.canAcceptInput = isOnCanvas || isOnBody || isOnHTML
            
            if (!this.canAcceptInput) {
                this._resetAllKeys()
            }
        }
        
        window.addEventListener("blur", updateInputFlag)
        document.addEventListener("focusin", updateInputFlag)
        document.addEventListener("focusout", updateInputFlag)
        document.addEventListener("mousedown", updateInputFlag)
        document.addEventListener("mouseup", updateInputFlag)
        
        if (this.canvas) {
            this.canvas.addEventListener("pointerleave", () => {
                this.canAcceptInput = false
                this._resetAllKeys()
            })
            
            this.canvas.addEventListener("pointerenter", () => {
                this.canAcceptInput = true
            })
        }
    }
    
    _resetAllKeys() {
        this.keys.w = false
        this.keys.a = false
        this.keys.s = false
        this.keys.d = false
        this.jumpPressed = false
        this.moveDir.set(0, 0, 0)
        if (this._isCharging) {
            this._isCharging = false
            this.currentCharge = 0
        }
    }

    _onKeyDown(e) {
        if (this._inputDisabled || !this.canAcceptInput) {
            return
        }
        
        if (e.code === PLAYER_CONFIG.keys.forward) this.keys.w = true
        if (e.code === PLAYER_CONFIG.keys.left) this.keys.a = true
        if (e.code === PLAYER_CONFIG.keys.backward) this.keys.s = true
        if (e.code === PLAYER_CONFIG.keys.right) this.keys.d = true
        if (e.code === PLAYER_CONFIG.keys.jump) this.jumpPressed = true
        
        if (e.code === PLAYER_CONFIG.keys.charge && 
            !this._isCharging && 
            Date.now() - this.lastShotTime > PLAYER_CONFIG.shotCooldown * 1000) {
            this._isCharging = true
            this.chargeStartTime = Date.now()
            this.currentCharge = 0
        }
    }

    _onKeyUp(e) {
        // ✨ IMPORTANT: Always reset keys on keyup, even if input is disabled
        // This prevents ghost movement when ESC is pressed while keys are held
        if (e.code === PLAYER_CONFIG.keys.forward) this.keys.w = false
        if (e.code === PLAYER_CONFIG.keys.left) this.keys.a = false
        if (e.code === PLAYER_CONFIG.keys.backward) this.keys.s = false
        if (e.code === PLAYER_CONFIG.keys.right) this.keys.d = false
        
        if (!this.canAcceptInput) {
            return
        }
        
        if (e.code === PLAYER_CONFIG.keys.charge && this._isCharging) {
            this._shoot()
            this._isCharging = false
            this.currentCharge = 0
        }
    }

    resetKeys() {
        this.keys.w = false
        this.keys.a = false
        this.keys.s = false
        this.keys.d = false
        this.jumpPressed = false
        this.moveDir.set(0, 0, 0)
        this._isCharging = false
        this.currentCharge = 0
    }

    /**
     * Explicitly handle key up event for WASD to prevent ghost movement
     * Called from SimulationTest when ESC is pressed
     */
    handleKeyUp(keyCode) {
        if (keyCode === PLAYER_CONFIG.keys.forward) this.keys.w = false
        if (keyCode === PLAYER_CONFIG.keys.left) this.keys.a = false
        if (keyCode === PLAYER_CONFIG.keys.backward) this.keys.s = false
        if (keyCode === PLAYER_CONFIG.keys.right) this.keys.d = false
    }

    /**
     * Completely disable input handling to prevent ghost movement
     * Called from SimulationTest when ESC is pressed
     */
    disableInput() {
        this._inputDisabled = true
        this.canAcceptInput = false
        this._resetAllKeys()
    }

    /**
     * Re-enable input handling
     * Also resets all keys to prevent ghost movement from stale key state
     */
    enableInput() {
        this._inputDisabled = false
        this.canAcceptInput = true
        this._resetAllKeys()
    }

    _checkGrounded(body) {
        this.canJump = false;
        if (!body.world) return

        const up = new CANNON.Vec3(0, 1, 0)

        for (let contact of body.world.contacts) {
            if (contact.bi !== body && contact.bj !== body) continue

            const normal = new CANNON.Vec3()
            if (contact.bi === body) {
                contact.ni.negate(normal)
            } else {
                normal.copy(contact.ni)
            }

            if (normal.dot(up) > this.maxSlopeDot) {
                this.canJump = true;
                return
            }
        }
    }

    _handleMovement(body) {
        // ✨ If input is disabled, stop movement immediately
        if (this._inputDisabled || !this.canAcceptInput) {
            this.keys.w = false
            this.keys.a = false
            this.keys.s = false
            this.keys.d = false
            this.moveDir.set(0, 0, 0)
            body.velocity.x = 0
            body.velocity.z = 0
            return
        }

        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);
        cameraDir.y = 0
        cameraDir.normalize()

        const right = new THREE.Vector3()
        right.crossVectors(cameraDir, new THREE.Vector3(0, 1, 0)).normalize()

        this.moveDir.set(0, 0, 0);

        if (this.keys.w) this.moveDir.add(cameraDir);
        if (this.keys.s) this.moveDir.sub(cameraDir);
        if (this.keys.a) this.moveDir.sub(right);
        if (this.keys.d) this.moveDir.add(right);

        if (this.moveDir.length() > 0) {
            this.moveDir.normalize();

            const targetYaw = Math.atan2(this.moveDir.x, this.moveDir.z);
            let diff = targetYaw - this.bodyYaw;

            while (diff > Math.PI) diff -= Math.PI * 2
            while (diff < -Math.PI) diff += Math.PI * 2

            this.bodyYaw += diff * PLAYER_CONFIG.bodyRotationSmooth * PLAYER_CONFIG.fixedTimeStep;
        }

        const targetVelX = this.moveDir.x * PLAYER_CONFIG.maxSpeed;
        const targetVelZ = this.moveDir.z * PLAYER_CONFIG.maxSpeed;

        body.velocity.x += (targetVelX - body.velocity.x) * PLAYER_CONFIG.acceleration * PLAYER_CONFIG.fixedTimeStep
        body.velocity.z += (targetVelZ - body.velocity.z) * PLAYER_CONFIG.acceleration * PLAYER_CONFIG.fixedTimeStep
    }

    _handleJump(body) {
        if (!this.jumpPressed || !this.canJump) return;

        const gravity = Math.abs(body.world.gravity.y)
        const jumpSpeed = Math.sqrt(2 * gravity * PLAYER_CONFIG.jumpHeight)

        body.velocity.y = jumpSpeed;
        this.jumpPressed = false;
        this.canJump = false;
    }

    _animateLegs(mesh, body) {
        if (!mesh) return

        const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2)

        const legs = []
        mesh.traverse(child => {
            if (child.userData && child.userData.isLeg) legs.push(child)
        })

        if (speed > 0.2) {
            this.walkTime += PLAYER_CONFIG.fixedTimeStep * PLAYER_CONFIG.walkSpeed * speed;
            const swing = Math.sin(this.walkTime) * PLAYER_CONFIG.maxLegSwing;
            if (legs[0]) legs[0].rotation.x = swing
            if (legs[1]) legs[1].rotation.x = -swing
        } else {
            this.walkTime = 0;
            legs.forEach(leg => {
                leg.rotation.x += (0 - leg.rotation.x) * 10 * PLAYER_CONFIG.fixedTimeStep
            })
        }
    }

    _updateHeadRotation(mesh) {
        let cuePivot = null
        mesh.traverse(child => {
            if (child.userData && child.userData.isCuePivot) cuePivot = child
        })

        if (!cuePivot) return

        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);

        const bodyMatrix = new THREE.Matrix4().makeRotationY(this.bodyYaw);
        const invBody = bodyMatrix.clone().invert()

        const localDir = cameraDir.clone().applyMatrix4(invBody)

        let yaw = Math.atan2(localDir.x, localDir.z)
        const horizontalLen = Math.sqrt(localDir.x ** 2 + localDir.z ** 2)
        let pitch = -Math.atan2(localDir.y, horizontalLen)

        pitch = Math.max(-PLAYER_CONFIG.maxHeadPitch, Math.min(PLAYER_CONFIG.maxHeadPitch, pitch))

        if (yaw > PLAYER_CONFIG.maxHeadYaw) {
            this.bodyYaw += yaw - PLAYER_CONFIG.maxHeadYaw;
            yaw = PLAYER_CONFIG.maxHeadYaw
        }

        if (yaw < -PLAYER_CONFIG.maxHeadYaw) {
            this.bodyYaw += yaw + PLAYER_CONFIG.maxHeadYaw;
            yaw = -PLAYER_CONFIG.maxHeadYaw
        }

        this.currentPitch += (pitch - this.currentPitch) * PLAYER_CONFIG.pitchSmooth;
        cuePivot.rotation.set(Math.PI / 2 + this.currentPitch, yaw, 0, "YXZ");
    }

    _animateCueCharge(mesh) {
        let cuePivot = null
        mesh.traverse(child => {
            if (child.userData && child.userData.isCuePivot) cuePivot = child
        })

        if (!cuePivot) return

        const cueBody = cuePivot.getObjectByName("PlayerCue")
        if (!cueBody) return

        const originalLength = cuePivot.userData.originalLength || 4;
        const minLength = cuePivot.userData.minLength || 2;

        if (this._isCharging) {
            const chargeTime = (Date.now() - this.chargeStartTime) / 1000;
            this.currentCharge = Math.min(chargeTime * PLAYER_CONFIG.chargeSpeed, PLAYER_CONFIG.maxCharge);
        } else {
            this.currentCharge -= PLAYER_CONFIG.releaseSpeed * PLAYER_CONFIG.fixedTimeStep;
            if (this.currentCharge < 0) this.currentCharge = 0;
        }

        const currentLength = originalLength - this.currentCharge * (originalLength - minLength);
        const scaleY = currentLength / originalLength

        cueBody.scale.set(1, scaleY, 1)
        cueBody.position.y = (currentLength / 2)

        // Đã loại bỏ logic cập nhật force hitbox (màu đỏ) theo yêu cầu.
    }

    _shoot() {
        if (!this.currentMesh || this.currentCharge <= 0.1) return;
        
        this.lastShotTime = Date.now();
        
        const force = (PLAYER_CONFIG.minForce + 
                      this.currentCharge * (PLAYER_CONFIG.maxForce - PLAYER_CONFIG.minForce)) * 
                      PLAYER_CONFIG.forceMultiplier;
        
        const direction = this.getCueWorldDirection(this.currentMesh);
        const tipPos = this.getCueTipPosition(this.currentMesh);
        
        if (this.currentBody && this.currentBody.world) {
            const hitRadius = PLAYER_CONFIG.effectRadius + 
                            this.currentCharge * PLAYER_CONFIG.effectRadiusMultiplier;
            const hitLength = PLAYER_CONFIG.effectLength + 
                            this.currentCharge * PLAYER_CONFIG.effectLengthMultiplier;
            
            // ✨ Track balls hit by cue for particle effects + recoil calculation
            const hitBalls = [];
            let totalRecoilImpulse = 0;  // ✨ Track recoil for Newton's 3rd law
            
            this.currentBody.world.bodies.forEach(body => {
                if (body.mass === 0 || body === this.currentBody) return;
                
                const bodyPos = body.position
                const toBody = new CANNON.Vec3(
                    bodyPos.x - tipPos.x,
                    bodyPos.y - tipPos.y,
                    bodyPos.z - tipPos.z
                )
                const dirVec = new CANNON.Vec3(direction.x, direction.y, direction.z);
                const distAlongDir = toBody.dot(dirVec);
                if (distAlongDir < 0 || distAlongDir > hitLength) return;
                
                const perpDistSq = Math.max(0, toBody.lengthSquared() - distAlongDir * distAlongDir);
                
                const bodyRadius = (body.shapes[0] && body.shapes[0] instanceof CANNON.Sphere) ? body.shapes[0].radius : 0;
                const totalRadius = hitRadius + bodyRadius;

                if (perpDistSq > totalRadius * totalRadius) return;
                
                // ✨ Tính impact normal (hướng từ cue tip đến ball contact point)
                const toBallVec = new THREE.Vector3(
                    bodyPos.x - tipPos.x,
                    bodyPos.y - tipPos.y,
                    bodyPos.z - tipPos.z
                ).normalize();
                
                // ✨ Lưu lại ball hit info + normal
                hitBalls.push({
                    body: body,
                    contactPos: new THREE.Vector3(bodyPos.x, bodyPos.y, bodyPos.z),
                    impactNormal: toBallVec
                });
                
                const forceFactor = 1 - (distAlongDir / hitLength);
                const finalForce = force * forceFactor;
                
                // ✨ Find ball name in syncList to check if it's Ball 8
                const ballEntry = this.syncList ? this.syncList.find(e => e.body === body) : null;
                const isBall8 = ballEntry && ballEntry.name === 'Ball 8';
                
                // ✨ Apply impulse: Contact Point for Ball 8, Center of Mass for regular balls
                if (isBall8) {
                    // Ball 8: Apply impulse at contact point to reduce unwanted spin
                    const ballRadius = (body.shapes[0] && body.shapes[0] instanceof CANNON.Sphere) ? body.shapes[0].radius : 0.15;
                    const impactOffset = new CANNON.Vec3(
                        toBallVec.x * ballRadius * 0.8,  // 80% of radius to reduce spin further
                        toBallVec.y * ballRadius * 0.8,
                        toBallVec.z * ballRadius * 0.8
                    );
                    
                    body.applyImpulse(
                        new CANNON.Vec3(
                            direction.x * finalForce,
                            direction.y * finalForce,
                            direction.z * finalForce
                        ),
                        impactOffset  // Apply at contact point
                    );
                    
                    // Dampen angular velocity to prevent excessive spin (Ball 8 only)
                    if (body.angularVelocity) {
                        body.angularVelocity.scale(0.3, body.angularVelocity);  // Keep only 30% of spin
                    }
                } else {
                    // Regular balls: Apply impulse at center of mass (normal behavior)
                    body.applyImpulse(
                        new CANNON.Vec3(
                            direction.x * finalForce,
                            direction.y * finalForce,
                            direction.z * finalForce
                        ),
                        body.position  // Apply at center
                    );
                }
                
                // ✨ Newton's 3rd Law Recoil
                // Because player is very light (0.01kg), heavier objects push much harder
                // Scaling: ball(0.17kg)→light, bowling(6.5kg)→medium, dummy(100kg)→strong
                const hitObjectMass = body.mass || 0.17;  // Default to ball mass if not set
                const massRatio = hitObjectMass / OBJECT_MASSES.PLAYER;  // e.g., 17 for ball, 650 for bowling, 10000 for dummy
                const sqrtMassRatio = Math.sqrt(massRatio);  // Square root prevents extreme scaling
                const recoilScaling = Math.min(sqrtMassRatio * 0.08, 3.0);  // Cap at 3.0 to keep reasonable bounds
                totalRecoilImpulse += finalForce * recoilScaling;
            })
            
            // ✨ Apply recoil impulse to player (push backwards)
            if (totalRecoilImpulse > 0 && this.currentBody) {
                this.currentBody.applyImpulse(
                    new CANNON.Vec3(
                        -direction.x * totalRecoilImpulse,
                        -direction.y * totalRecoilImpulse * 0.3,  // Reduce vertical recoil
                        -direction.z * totalRecoilImpulse
                    ),
                    this.currentBody.position
                )
                
                // ✨ Prevent excessive spinning during recoil
                // Dampen angular velocity perpendicular to movement to prevent wild rotation
                // Keep rolling motion along movement direction
                const moveDir = new THREE.Vector3(direction.x, 0, direction.z).normalize();
                const angVel = this.currentBody.angularVelocity;
                const angVelAlongMove = angVel.dot(new CANNON.Vec3(moveDir.x, 0, moveDir.z));
                
                // Reset angular velocity and only keep forward-roll component (reduced)
                this.currentBody.angularVelocity.set(
                    angVelAlongMove * moveDir.x * 0.3,  // Keep 30% of forward roll
                    angVel.y * 0.1,  // Heavily dampen vertical spin
                    angVelAlongMove * moveDir.z * 0.3   // Keep 30% of forward roll
                );
            }
            
            // ✨ Check if Ball 8 was hit by cue - only destroy if FATIGUED
            if (this.syncList && this.destroySystem) {
                hitBalls.forEach(hit => {
                    // Find the entry in syncList corresponding to this body
                    const ball8Entry = this.syncList.find(e => e.body === hit.body);
                    if (ball8Entry && ball8Entry.name === 'Ball 8') {
                        const ball8AI = ball8Entry.body.userData?.ball8AI;
                        
                        // ✨ NEW: Only destroy if ball 8 is FATIGUED
                        if (ball8AI && ball8AI.isFatigued) {
                            console.debug('[playerMovement] Ball 8 hit by cue while FATIGUED - destroying');
                            // Destroy Ball 8 by calling the destroy system's destroy method
                            this.destroySystem._destroyEntry(ball8Entry);
                        } else {
                            // ✨ NEW: Ball 8 not fatigued - trigger blasting effect instead
                            console.debug('[playerMovement] Ball 8 hit by cue while NOT fatigued - blasting effect');
                            if (this.particleManager) {
                                this.particleManager.spawn('blasting', hit.contactPos);
                            }
                        }
                    }
                });
            }
            
            // ✨ Trigger impact ring effect cho mỗi ball bị chạm
            if (hitBalls.length > 0 && this.scene) {
                hitBalls.forEach(hit => {
                    const impactEffect = createImpactRingEffect(
                        this.scene,
                        hit.contactPos,
                        {
                            lifetime: 0.3,
                            initialOpacity: Math.min(this.currentCharge * 0.8, 0.9),
                            impactNormal: hit.impactNormal
                        }
                    );
                    // Store effect để update trong loop
                    if (!this.particleEffects) {
                        this.particleEffects = [];
                    }
                    this.particleEffects.push(impactEffect);
                });
            }
        }
        

    }

    _createCueBody(world) {
        if (!world || !this.currentMesh) return null;
        
        // Xóa cue body cũ nếu có
        this.removeCueBody();
        
        const cuePivot = this.currentMesh.getObjectByName("CuePivot");
        if (!cuePivot) return null;

        const originalLength = cuePivot.userData.originalLength || 4;
        
        // Tạo cue shape với kích thước thay đổi theo charge
        const cueShape = new CANNON.Cylinder(0.015, 0.06, originalLength, 16);

        // Tạo cue body
        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.KINEMATIC,
            collisionFilterGroup: COLLISION_GROUPS.CUE,
            collisionFilterMask: COLLISION_MASKS.CUE,
            material: this.physicsMaterials?.cue || undefined  // ✨ Set cue material để tính contact forces
        });
        body.addShape(cueShape);
        world.addBody(body);
        
        // Tạo force trigger body - nằm ở đầu tip
        const forceShape = new CANNON.Sphere(PLAYER_CONFIG.baseHitboxRadius);
        const forceBody = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.KINEMATIC,
            collisionFilterGroup: COLLISION_GROUPS.CUE,
            collisionFilterMask: COLLISION_MASKS.CUE,
            material: this.physicsMaterials?.cue || undefined  // ✨ Set cue material
        });
        forceBody.addShape(forceShape);
        world.addBody(forceBody);
        
        // Đánh dấu để CollisionManager biết
        body.userData = { 
            isCueBody: true, 
            isKinematic: true,
            originalLength: originalLength
        };
        forceBody.userData = { 
            isForceBody: true, 
            isTrigger: true
        };
        
        this.cueBody = body;
        this.forceBody = forceBody;
        this.cueActive = true;
        
        // Thêm vào CollisionManager ngay lập tức
        setTimeout(() => {
            if (this.cueBody && this.cueActive) {
                CollisionManager.addHitboxForObject({ 
                    body: this.cueBody, 
                    name: 'Cue', 
                    type: 'kinematic' 
                });
            }
            if (this.forceBody && this.cueActive) {
                CollisionManager.addHitboxForObject({ 
                    body: this.forceBody, 
                    name: 'Force', 
                    type: 'trigger' 
                });
            }
        }, 0);
        
        return body;
    }

    removeCueBody() {
        // Xóa khỏi world
        if (this.cueBody && this.cueBody.world) {
            this.cueBody.world.removeBody(this.cueBody);
        }
        if (this.forceBody && this.forceBody.world) {
            this.forceBody.world.removeBody(this.forceBody);
        }
        
        // Xóa khỏi CollisionManager
        if (this.cueBody) {
            CollisionManager.removeHitboxForObject({ body: this.cueBody });
        }
        if (this.forceBody) {
            CollisionManager.removeHitboxForObject({ body: this.forceBody });
        }
        
        this.cueBody = null;
        this.forceBody = null;
        this.cueActive = false;
        
    }

    _updateOpacityBasedOnCameraDistance(mesh, cameraController) {
        // Đã vô hiệu hóa tính năng làm mờ player khi zoom gần camera theo yêu cầu.
        return;
    }

    _applyBodyRotation(mesh) {
        mesh.rotation.y = this.bodyYaw;
    }

    _getPhysicalCueWorldTransform(mesh) {
        const cuePivot = mesh.getObjectByName("CuePivot");
        if (!cuePivot) return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

        // Get world transform of the pivot
        const pivotWorldPosition = new THREE.Vector3();
        const pivotWorldQuaternion = new THREE.Quaternion();
        cuePivot.getWorldPosition(pivotWorldPosition);
        cuePivot.getWorldQuaternion(pivotWorldQuaternion);

        // Get original length
        const originalLength = cuePivot.userData.originalLength || 4;
        const minLength = cuePivot.userData.minLength || 2;

        // Calculate how much the cue is pulled back
        const pullBackDistance = this.currentCharge * (originalLength - minLength);

        // The center of the physical cue body (which has constant length)
        // starts at originalLength / 2 and moves back by pullBackDistance.
        // The cue's local "up" is its forward direction.
        const localCenterOffset = new THREE.Vector3(0, (originalLength / 2) - pullBackDistance, 0);

        // Transform this local offset into world space
        const worldCenterPosition = localCenterOffset.applyQuaternion(pivotWorldQuaternion).add(pivotWorldPosition);

        return { position: worldCenterPosition, quaternion: pivotWorldQuaternion };
    }

    _getCueWorldTransform(mesh) {
        const cuePivot = mesh.getObjectByName("CuePivot");
        if (!cuePivot) return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

        const cueMesh = cuePivot.getObjectByName("PlayerCue");
        if (!cueMesh) return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

        const worldPosition = new THREE.Vector3();
        cueMesh.getWorldPosition(worldPosition);

        const worldQuaternion = new THREE.Quaternion();
        cueMesh.getWorldQuaternion(worldQuaternion);

        return { position: worldPosition, quaternion: worldQuaternion };
    }

    getCueWorldDirection(mesh) {
        let cuePivot = null
        mesh.traverse(child => {
            if (child.userData && child.userData.isCuePivot) cuePivot = child
        })

        if (!cuePivot) return new THREE.Vector3(0, 0, 1)

        const worldDir = new THREE.Vector3(0, 1, 0)
            .applyQuaternion(cuePivot.quaternion)
            .applyQuaternion(mesh.quaternion)
            .normalize();
        
        return worldDir
    }

    getCueTipPosition(mesh) {
        let cuePivot = null
        mesh.traverse(child => {
            if (child.userData && child.userData.isCuePivot) cuePivot = child
        })

        if (!cuePivot) return new THREE.Vector3();

        const cueBody = cuePivot.getObjectByName("PlayerCue")
        if (!cueBody) return new THREE.Vector3()

        const originalLength = cuePivot.userData.originalLength
        const currentLength = originalLength * cueBody.scale.y

        const tipLocalPos = new THREE.Vector3(0, currentLength, 0)
        
        const worldPos = tipLocalPos.clone()
            .applyQuaternion(cuePivot.quaternion)
            .add(cuePivot.position)
            .applyQuaternion(mesh.quaternion)
            .add(mesh.position)
        
        return worldPos
    }

    getOriginalCueTipPosition(mesh) {
        let cuePivot = null
        mesh.traverse(child => {
            if (child.userData && child.userData.isCuePivot) cuePivot = child
        })

        if (!cuePivot) return new THREE.Vector3();

        const originalLength = cuePivot.userData.originalLength || 4
        
        const tipLocalPos = new THREE.Vector3(0, originalLength, 0)
        
        const worldPos = tipLocalPos.clone()
            .applyQuaternion(cuePivot.quaternion)
            .add(cuePivot.position)
            .applyQuaternion(mesh.quaternion)
            .add(mesh.position)
        
        return worldPos
    }

    update(body, mesh, cameraController) {
        this.currentBody = body;
        this.currentMesh = mesh;
        
        // Update canAcceptInput based on activeElement (but never override _inputDisabled)
        if (!this._inputDisabled) {
            const activeElement = document.activeElement;
            const isOnCanvas = activeElement === this.canvas;
            const isOnBody = activeElement === document.body;
            const isOnHTML = activeElement === document.documentElement;
            this.canAcceptInput = isOnCanvas || isOnBody || isOnHTML;
        }
        
        if ((this._inputDisabled || !this.canAcceptInput) && (this.keys.w || this.keys.a || this.keys.s || this.keys.d)) {
            this._resetAllKeys();
        }
        
        // Kiểm tra nếu cue bị remove từ bên ngoài
        const cuePivot = mesh.getObjectByName("CuePivot");
        if (!cuePivot && this.cueActive) {
            this.cueActive = false;
            this.removeCueBody();
        }
        
        // Auto-activate cue if shouldHaveCue flag is set (for Scene1 gameplay)
        if (mesh.userData.shouldHaveCue && !this.cueActive) {
            this.cueActive = true;
        }
        
        // Chỉ tạo cue body nếu đang active và có cuePivot
        if (!this.cueBody && body && body.world && this.cueActive && cuePivot) {
            this._createCueBody(body.world);
        }

        this._checkGrounded(body);
        this._handleMovement(body);
        this._handleJump(body);
        this._animateLegs(mesh, body);
        this._updateHeadRotation(mesh);
        this._applyBodyRotation(mesh);
        this._animateCueCharge(mesh);

        if (mesh.name === "Player") {
            this._updateOpacityBasedOnCameraDistance(mesh, cameraController);
        }

        // Update physics bodies
        if (this.cueBody) {
            const { position, quaternion } = this._getPhysicalCueWorldTransform(mesh);
            this.cueBody.position.copy(position);
            this.cueBody.quaternion.copy(quaternion);
        }
        
        if (this.forceBody) {
            const tipPos = this.getCueTipPosition(mesh);
            this.forceBody.position.copy(tipPos);
            
            // Cập nhật kích thước force body theo charge
            const radius = PLAYER_CONFIG.baseHitboxRadius + 
                          this.currentCharge * PLAYER_CONFIG.hitboxRadiusMultiplier;
            
            // Cập nhật shape nếu cần (có thể tạo lại shape mới)
            if (this.forceBody.shapes.length > 0) {
                // Xóa shape cũ
                this.forceBody.shapes.forEach(shape => {
                    this.forceBody.removeShape(shape);
                });
                
                // Tạo shape mới với kích thước hiện tại
                const newShape = new CANNON.Sphere(radius);
                this.forceBody.addShape(newShape);
            }
        }

        // ✨ Update particle effects
        if (this.particleEffects && this.particleEffects.length > 0) {
            const delta = 1 / 60; // Assume 60 FPS
            for (let i = this.particleEffects.length - 1; i >= 0; i--) {
                const effect = this.particleEffects[i];
                effect.update(delta);
                if (effect.finished) {
                    this.particleEffects.splice(i, 1);
                }
            }
        }
    }

    getBodyYaw() { return this.bodyYaw; }
    getChargeAmount() { return this.currentCharge; }
    isCharging() { return this._isCharging; }
    getConfig() { return PLAYER_CONFIG; }

    dispose() {
        window.removeEventListener("keydown", this._onKeyDown.bind(this));
        window.removeEventListener("keyup", this._onKeyUp.bind(this));
        this.removeCueBody();
    }
}