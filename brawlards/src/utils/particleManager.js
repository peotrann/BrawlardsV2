import * as THREE from 'three'
import { createSmokeEffect } from "../effects/particles/particle1.js"
import { createSparkEffect } from "../effects/particles/particle2.js"
import { createDustEffect } from "../effects/particles/particle3.js"
import { createWaterSplashEffect } from "../effects/particles/particle4.js"
import { createBlackSmokePuffEffect } from "../effects/particles/particle5.js"
import { createGhostSmokeEffect } from "../effects/particles/particle6.js"
import { createSweatEffect } from "../effects/particles/particle8.js"
import { createBlastingEffect } from "../effects/particles/particle9.js"


export class ParticleManager {
  constructor(scene) {
    this.scene = scene
    this.effects = []
    this.groundObjects = [] // Để raycast cho các hiệu ứng như vũng nước
  }

  spawn(type, position, options = {}) {
    if (type === 'smoke') {
      const effect = createSmokeEffect(this.scene, position)
      this.effects.push(effect)
    } else if (type === 'spark') {
      const effect = createSparkEffect(this.scene, position, options)
      this.effects.push(effect)
    } else if (type === 'dust') {
      const effect = createDustEffect(this.scene, position, options)
      this.effects.push(effect)
    } else if (type === 'waterSplash') {
      // Truyền groundObjects vào cho hiệu ứng để raycast
      const effect = createWaterSplashEffect(this.scene, position, { ...options, groundObjects: this.groundObjects })
      this.effects.push(effect)
    } else if (type === 'blackSmoke') {
      const effect = createBlackSmokePuffEffect(this.scene, position, options)
      this.effects.push(effect)
    } else if (type === 'ghostSmoke') {
      const effect = createGhostSmokeEffect(this.scene, position, { ...options, groundObjects: this.groundObjects })
      this.effects.push(effect)
    } else if (type === 'sweat') {
      const effect = createSweatEffect(this.scene, position, options)
      this.effects.push(effect)
    } else if (type === 'blasting') {
      const effect = createBlastingEffect(this.scene, position, options)
      this.effects.push(effect)
    }

  }

  update(delta) {
    this.effects = this.effects.filter(e => {
      e.update(delta)
      return !e.finished
    })
  }

  /**
   * Set các object mà particle có thể va chạm (sàn, bàn, etc.)
   * @param {THREE.Object3D[]} objects 
   */
  setGroundObjects(objects) {
    this.groundObjects = objects;
  }
}
