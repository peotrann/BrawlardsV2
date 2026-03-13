# 8PoolGame - Brawlards

A 3D billiard pool game built with THREE.js and physics simulation using Cannon-ES.

## 🎮 Features

- **3D Billiards Simulation** - Realistic physics with Cannon-ES
- **Multiple Game Modes**:
  - Play Mode - Complete gameplay experience
  - Simulation Test - Sandbox for testing mechanics
  - Inspector - 3D object viewer and debugger
- **AI Characters** - Guy AI, Ball 8 AI, Compune dialogue system
- **Dynamic Environments** - Multiple scenes with hazards and interactions
- **Background Music** - Ambient soundtrack system
- **Particle Effects** - Smoke, sweat effects, and visual feedback

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd brawlards
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Server will start at `http://localhost:5173`

### Build

Create a production build:

```bash
npm run build
```

Output will be in `brawlards/dist/`

### Preview

Preview the production build locally:

```bash
npm run preview
```

## 📁 Project Structure

```
brawlards/
├── src/
│   ├── main.js                 # Main entry point
│   ├── core/                   # Game engines
│   │   ├── Play.js            # Gameplay mode
│   │   ├── SimulationTest.js   # Simulation sandbox
│   │   └── Inspector.js        # 3D object inspector
│   ├── AI/                      # AI systems
│   │   ├── compuneBot.js       # NPC dialogue AI
│   │   ├── guyBot.js           # Guy character AI
│   │   └── ball8Bot.js         # Ball 8 behavior
│   ├── assets/                  # Game assets
│   │   ├── objects/            # 3D object definitions
│   │   └── scenes/             # Scene data
│   ├── physics/                 # Physics system
│   ├── ui/                      # UI components
│   ├── music/                   # Music system
│   │   └── MusicPlayer.js       # Background music manager
│   └── utils/                   # Utility functions
├── public/                      # Static assets
├── index.html                   # HTML entry point
├── package.json
├── vite.config.js              # Vite configuration
└── .gitignore
```

## 🌐 Deployment to GitHub Pages

This project is configured to automatically deploy to GitHub Pages using GitHub Actions.

### Setup Instructions

1. **Create a GitHub Repository**
   - Push your code to GitHub
   - Repository can be public or private

2. **Enable GitHub Pages**
   - Go to Settings → Pages
   - Source: Deploy from a branch
   - Branch: `gh-pages` (will be created by workflow)

3. **Automatic Deployment**
   - Any push to `main` or `master` branch triggers the workflow
   - Build runs automatically
   - Deployed to `https://username.github.io/brawlards/`

### Manual Deployment

If you prefer manual deployment:

```bash
npm run build
# Then commit dist/ folder and push
```

## 🎨 Technologies Used

- **THREE.js** - 3D graphics
- **Cannon-ES** - Physics engine
- **Vite** - Build tool
- **HTML5 Canvas** - Rendering
- **Web Audio API** - Sound system

## 📝 License

MIT

## 👤 Author

[Your Name/Team]

## 🐛 Known Issues

- [ ] Check current GitHub Actions status

## 📚 Additional Notes

- Base URL for GitHub Pages is `/brawlards/`
- Music files should be in `src/music/` directory
- Physics simulation uses 60 FPS fixed timestep
- UI uses IT-style dark theme with blue accents
