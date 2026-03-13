# CompuneAI - Scene Manager Integration

## Tóm Tắt

- **1 file**: `src/AI/compuneBot.js` (160 dòng)
- **Dialog data**: Mỗi scene có file riêng (e.g. `scene1Dialogs.js`)
- **Cách dùng**: 3 dòng code!

---

## Setup Trong Scene Manager

### 1. Import

```javascript
import { CompuneAI } from "../AI/compuneBot.js"
import { SCENE1_COMPUNES } from "../assets/scenes/scene1Dialogs.js"
```

### 2. Tạo Map để quản lý Compune AIs

```javascript
export class Scene1Manager {
  constructor(sceneGroup, destroySystem, mainScene) {
    // ... existing code ...
    this.compuneAIControllers = new Map()
  }
}
```

### 3. Khi Compune Spawn

```javascript
// Ở hàm spawning hoặc initialization
onCompuneSpawned(entry) {
  if (entry.name !== 'Compune') return
  
  const compuneAI = new CompuneAI(entry.mesh, entry.body, this.scene)
  
  // Set dialog pages (chọn từ SCENE1_COMPUNES)
  const dialogKey = entry.mesh.userData.dialogKey || 'compune_1'
  compuneAI.setDialog(SCENE1_COMPUNES[dialogKey])
  
  // Store để quản lý
  this.compuneAIControllers.set(entry, compuneAI)
}
```

### 4. Update Mỗi Frame

```javascript
// Trong hàm update() của Scene1Manager
update(delta, syncList) {
  // ... existing code ...

  // Update compunes
  const entriesToRemove = []
  
  this.compuneAIControllers.forEach((compuneAI, entry) => {
    compuneAI.update(delta, syncList)
    
    if (compuneAI.shouldDespawn) {
      entriesToRemove.push(entry)
    }
  })
  
  // Remove despawned
  entriesToRemove.forEach(entry => {
    const compuneAI = this.compuneAIControllers.get(entry)
    if (compuneAI) {
      compuneAI.cleanup()
      this.compuneAIControllers.delete(entry)
    }
    // Remove from scene, physics, etc...
  })
}
```

### 5. Cleanup Khi Thoát Scene

```javascript
cleanup() {
  this.compuneAIControllers.forEach((compuneAI) => {
    compuneAI.cleanup()
  })
  this.compuneAIControllers.clear()
}
```

---

## Cách Tạo Dialog Cho Scene Mới

### 1. Tạo file `src/assets/scenes/<sceneName>Dialogs.js`

```javascript
export const SCENE_NAME_COMPUNES = {
  compune_1: [
    "Câu 1",
    "Câu 2",
    "Câu 3",
  ],

  compune_2: [
    "Câu khác",
  ],
}
```

### 2. Import và dùng trong Scene Manager

```javascript
import { SCENE_NAME_COMPUNES } from "../assets/scenes/<sceneName>Dialogs.js"

// Khi spawn
compuneAI.setDialog(SCENE_NAME_COMPUNES.compune_1)
```

---

## API

### CompuneAI

```javascript
// Constructor
new CompuneAI(mesh, body, scene)

// Methods
setDialog(pages)          // pages = ["text1", "text2", ...]
update(delta, syncList)   // Call mỗi frame
cleanup()                 // Call trước khi despawn

// Properties
shouldDespawn             // Boolean flag
```

---

## Controls

- **Player approaches** → Text shows (page 1)
- **Press ENTER** → Next page
- **Press ESC** → Skip & close
- **After 15s** → Auto despawn

---

## Config (Edit trong compuneBot.js)

```javascript
this.triggerDistance = 1.2    // Distance to trigger
this.despawnDelay = 15        // Seconds after close
```

---

## Example

```javascript
// Scene1Manager.js
export class Scene1Manager {
  constructor() {
    this.compuneAIControllers = new Map()
  }

  onCompuneSpawned(entry) {
    if (entry.name !== 'Compune') return
    
    const ai = new CompuneAI(entry.mesh, entry.body, this.scene)
    ai.setDialog(SCENE1_COMPUNES[entry.mesh.userData.dialogKey || 'compune_1'])
    
    this.compuneAIControllers.set(entry, ai)
  }

  update(delta, syncList) {
    const toRemove = []
    
    this.compuneAIControllers.forEach((ai, entry) => {
      ai.update(delta, syncList)
      if (ai.shouldDespawn) toRemove.push(entry)
    })
    
    toRemove.forEach(entry => {
      this.compuneAIControllers.get(entry).cleanup()
      this.compuneAIControllers.delete(entry)
      // Remove from scene...
    })
  }

  cleanup() {
    this.compuneAIControllers.forEach(ai => ai.cleanup())
    this.compuneAIControllers.clear()
  }
}
```

---

Done! Đơn giản lắm 👍
