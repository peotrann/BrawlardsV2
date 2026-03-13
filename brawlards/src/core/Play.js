import * as THREE from "three"
import { sceneAssets } from "../assets/sceneAssets.js"
import { startSimulationTest } from "./SimulationTest.js"
import { IT_STYLE } from "../main.js"

export function startPlay(renderer, onBack) {
  document.body.style.margin = "0"
  document.body.style.overflow = "hidden"

  // Background overlay (black)
  const background = document.createElement("div")
  background.id = "playBackground"
  background.style.position = "fixed"
  background.style.top = "0"
  background.style.left = "0"
  background.style.width = "100%"
  background.style.height = "100%"
  background.style.backgroundColor = "#111111"
  background.style.zIndex = "99"
  document.body.appendChild(background)

  // Clear renderer scene (remove inspector meshes)
  renderer.clear()
  renderer.setClearColor(0x111111)
  renderer.render(new THREE.Scene(), new THREE.Camera())

  // Back button (bottom-right, IT style - dark red)
  const backButton = document.createElement("button")
  backButton.id = "playBackButton"
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

  backButton.onclick = () => {
    cleanup()
    onBack()
  }

  document.body.appendChild(backButton)

  // Scene selection UI (center of screen, fixed position)
  const container = document.createElement("div")
  container.id = "playContainer"
  container.classList.add("page-ui")
  container.style.position = "fixed"
  container.style.top = "50%"
  container.style.left = "50%"
  container.style.transform = "translate(-50%, -50%)"
  container.style.zIndex = "1000"
  container.style.display = "flex"
  container.style.flexDirection = "column"
  container.style.gap = "10px"
  container.style.textAlign = "center"
  document.body.appendChild(container)

  // Helper function for labels (IT box style)
  function createLabel(text, fontSize = "14px", fontWeight = "normal", color = "#ccc", withFrame = true) {
    const label = document.createElement("div")
    label.textContent = text
    label.style.padding = "10px"
    label.style.fontSize = fontSize
    label.style.fontWeight = fontWeight
    label.style.fontFamily = "'Consolas', 'Monaco', 'Courier New', monospace"
    label.style.color = color
    if (withFrame) {
      label.style.backgroundColor = IT_STYLE.colors.darkBg
      label.style.border = `1px solid ${IT_STYLE.colors.accentBlue}`
      label.style.borderRadius = "0px"
      label.style.boxShadow = `0 0 10px rgba(0, 102, 255, 0.4), inset 0 0 5px rgba(0, 102, 255, 0.2)`
    }
    return label
  }

  // Scene group
  const sceneGroup = document.createElement("div")
  sceneGroup.style.display = "flex"
  sceneGroup.style.flexDirection = "column"
  sceneGroup.style.gap = "4px"
  container.appendChild(sceneGroup)

  // Scene name (green) + description
  const sceneName = createLabel(sceneAssets[0].name, "13px", "bold", "#0f0", false)
  const sceneDesc = createLabel(sceneAssets[0].description || "", "12px", "normal", "#ccc", false)
  let currentSceneIndex = 0
  sceneGroup.appendChild(sceneName)
  sceneGroup.appendChild(sceneDesc)

  // Start Game button (IT style)
  const playGameBtn = document.createElement("button")
  playGameBtn.innerText = "Start Game"
  IT_STYLE.applyToElement(playGameBtn, 'button')
  playGameBtn.style.marginTop = "10px"

  playGameBtn.onclick = () => {
    startGameplay(currentSceneIndex)
  }

  sceneGroup.appendChild(playGameBtn)

  // Arrow keys: Enter to start game
  const keyDownHandler = (event) => {
    if (document.activeElement !== document.body) return

    if (event.code === "Enter") {
      event.preventDefault()
      startGameplay(currentSceneIndex)
    }
  }

  window.addEventListener("keydown", keyDownHandler)

  let gameplayCleanup = null

  function startGameplay(sceneIndex) {
    cleanup()
    gameplayCleanup = startSimulationTest(renderer, () => {
      // ✨ IMPORTANT: Call cleanup from SimulationTest first, then return to main menu
      if (gameplayCleanup) {
        gameplayCleanup()
      }
      onBack()
    }, true, sceneIndex)
  }

  function cleanup() {
    window.removeEventListener("keydown", keyDownHandler)

    const bg = document.getElementById("playBackground")
    if (bg) bg.remove()

    const btn = document.getElementById("playBackButton")
    if (btn) btn.remove()

    const cont = document.getElementById("playContainer")
    if (cont) cont.remove()
  }

  return cleanup
}
