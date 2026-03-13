import * as THREE from 'three'

/**
 * Quản lý behavior của các nhân vật (Dummy, Guy, Guide)
 * Khi không bị cam possess: Idle stance, quay mặt về camera
 * Khi bị cam possess: Quay mặt theo camera direction
 */
export class CharacterController {
    constructor(camera) {
        this.camera = camera
        this.currentPitch = 0
    }

    /**
     * Cập nhật nhân vật khi KHÔNG bị possess (idle mode)
     * @param {THREE.Group} mesh - Character mesh
     * @param {CANNON.Body} body - Character physics body
     */
    updateIdleMode(mesh, body) {
        // Initialize bodyYaw in userData if not exists
        if (mesh.userData.bodyYaw === undefined) {
            mesh.userData.bodyYaw = mesh.rotation.y
        }

        // 1. Tính yaw để quay mặt về camera
        const cameraPos = this.camera.position
        const meshPos = mesh.position
        const dirToCamera = new THREE.Vector3()
            .subVectors(cameraPos, meshPos)
            .normalize()

        // Tính yaw angle để face camera
        const targetYaw = Math.atan2(dirToCamera.x, dirToCamera.z)
        
        // Smooth interpolation về target yaw
        let diff = targetYaw - mesh.userData.bodyYaw
        
        // Handle angle wrapping
        if (diff > Math.PI) diff -= 2 * Math.PI
        if (diff < -Math.PI) diff += 2 * Math.PI
        
        mesh.userData.bodyYaw += diff * 5 * (1 / 60) // Smooth 5 rad/s rotation

        // 2. Reset leg animations (idle position)
        const legs = mesh.children.filter(child => child.userData?.isLeg)
        legs.forEach(leg => {
            // Lerp slowly back to neutral position
            leg.rotation.x += (0 - leg.rotation.x) * 10 * (1 / 60)
        })

        // 3. Áp dụng rotation vào mesh ONLY (visual)
        // Không set body quaternion - để physics engine quản lý
        mesh.rotation.y = mesh.userData.bodyYaw
    }

    /**
     * Cập nhật nhân vật khi BỊ possess (possessed mode)
     * Quay mặt theo camera direction (giống Player behavior)
     * @param {THREE.Group} mesh - Character mesh
     * @param {CANNON.Body} body - Character physics body
     */
    updatePossessedMode(mesh, body) {
        // Initialize bodyYaw in userData if not exists
        if (mesh.userData.bodyYaw === undefined) {
            mesh.userData.bodyYaw = mesh.rotation.y
        }

        // Camera direction
        const cameraDir = new THREE.Vector3()
        this.camera.getWorldDirection(cameraDir)
        cameraDir.y = 0
        cameraDir.normalize()

        // Calculate yaw từ camera direction
        const targetYaw = Math.atan2(cameraDir.x, cameraDir.z)
        
        // Smooth rotation
        let diff = targetYaw - mesh.userData.bodyYaw
        
        // Handle angle wrapping
        if (diff > Math.PI) diff -= 2 * Math.PI
        if (diff < -Math.PI) diff += 2 * Math.PI
        
        // Faster rotation khi possessed
        mesh.userData.bodyYaw += diff * 3 * (1 / 60)

        // Reset legs (no animation while idle)
        const legs = mesh.children.filter(child => child.userData?.isLeg)
        legs.forEach(leg => {
            leg.rotation.x += (0 - leg.rotation.x) * 10 * (1 / 60)
        })

        // Apply rotation to mesh only (visual)
        mesh.rotation.y = mesh.userData.bodyYaw
    }

    /**
     * Lấy body yaw hiện tại (for animation/AI systems)
     */
    getBodyYaw(mesh) { 
        return mesh.userData.bodyYaw ?? mesh.rotation.y
    }

    /**
     * Set body yaw (for external control)
     */
    setBodyYaw(mesh, yaw) { 
        mesh.userData.bodyYaw = yaw 
    }
}
