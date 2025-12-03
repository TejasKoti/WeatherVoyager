# 🌍 WeatherVoyager : Global Balloon Tracker & Atmospheric Explorer

A full-stack, real-time **atmospheric balloon visualization platform** that reconstructs global high-altitude balloon paths, enriches them with **live weather data**, and presents everything inside a polished, modern web interface where users can:

- Explore reconstructed 24-hour balloon trajectories  
- View temperature, wind speed, and wind direction for each balloon  
- Switch between a 3D flat-map and a full Earth globe  
- Inspect individual balloons with detailed metadata  
- Experience a cinematic 3D landing page with scroll-driven animation  
- Use continent filters to focus on specific regions  

WeatherVoyager functions as a **live atmospheric explorer**, powered by a Next.js frontend, a custom Node API pipeline, the Windborne Treasure network, and Redis-backed weather caching.

---

## 🖼️ Screenshots

- **Landing Page**  


https://github.com/user-attachments/assets/729f3803-c964-4f40-8a45-c7877743a25e


- **3D Globe View**  
  ![Globe](Preview/B_GlobeView.png)

- **3D Map View**  
  ![Map](Preview/C_MapView.png)

- **Fly-Map Mode**  
  ![FlyMap](Preview/D_FlyMapView.png)

---

## 📂 Project Structure

```
WeatherVoyager/
│
├── app/                               # All Next.js routes and UI screens
│   ├── page.tsx                       # Cinematic 3D landing page
│   ├── windmap/
│   │   ├── page.tsx                   # Main interactive map explorer
│   │   └── layout.tsx                 # Layout wrapper for map mode
│   │
│   ├── components/                    # Reusable 3D + UI components
│   │   ├── GlobeView.tsx              # Full 3D globe renderer
│   │   ├── MapView.tsx                # 3D flat-map engine with tiles and trails
│   │   └── Scene3D.tsx                # Landing page 3D scene (clouds, drones, stars)
│   │
│   └── api/                           # Server pipeline merging Treasure + Weather + Redis
│
├── lib/                               # Backend logic & shared utilities
│   ├── redis.ts                       # Redis client (ioredis)
│   ├── weather.ts                     # Open-Meteo batching + caching layer
│   ├── windborne.ts                   # Windborne Treasure fetch + 24hr reconstruction
│   └── types.ts                       # Shared type definitions
│
├── Preview/                           # Screenshots and demo media for README
│
└── README.md                          # Main project documentation
```

---

## 🧱 Tech Stack

### 🎨 Frontend

The frontend is built around smooth interactions, real-time visuals, and a clean development flow.

- **Next.js 16** for routing, server functions, and overall structure  
- **React 18** powering the UI and rendering pipeline  
- **TypeScript** for strong typing across both client and server code  
- **Tailwind CSS** for fast, consistent styling without fighting CSS  
- **Framer Motion** handling subtle transitions to keep the map and UI feeling alive  
- **React Three Fiber + Three.js** driving all the 3D scenes including the landing page, globe, and flat-map  
- **MapLibre tiles** for high-quality global map rendering inside the custom 3D environment  

### ⚙️ Backend

The backend is lightweight but efficient, designed to merge multiple data sources and avoid API rate limits.

- **Next.js API Routes** acting as the server layer for data assembly  
- **Windborne Treasure API** providing raw 24-hour balloon tracks  
- **Open-Meteo API** supplying live temperature, wind speed, and wind direction  
- **Redis Cloud (ioredis)** as a caching layer so weather is fetched once per region  
- **Grid-based batching system** that groups balloons by 1×1 degree cells to massively cut API calls  

---

## 🔧 Setup & Run

### 1) Install dependencies

```
npm install
```

### 2) Create `.env.local`

1. Go to https://cloud.redis.io/ and create your redis server  
2. Add the private key to a new file named `.env.local` in your root folder:

```
REDIS_URL=rediss://default:<password>@<host>:<port>
REDIS_WEATHER_TTL_SECONDS=1800
```

### 3) Start the dev server

Run this command in a PowerShell window inside the root directory:

```
npm run dev
```

### 4) Visit the app

Browser Preview:

```
http://localhost:3000
```

- `/` → Cinematic 3D landing experience  
- `/windmap` → Interactive map explorer  

---

## ⚠️ Notes

- Weather data might not populate instantly on first load.  
  The cache warms up as new grid cells are visited.

- Globe mode is heavier than the flat-map. If performance drops,  
  narrowing the focus radius helps a lot.

- Selection mode hides or dims all other balloons on purpose.  
  This keeps the user focused on the balloon being inspected.

- **Scene3D** includes a full WebGL fallback, so users without GPU support  
  still see a clean landing page instead of a blank canvas.

- All weather caching lives under the Redis key prefix `wx:*`.  
  Changing the TTL adjusts how quickly new weather appears.

- The 3D landing experience uses scroll as its main driver.  
  Anything that blocks scroll events (browser extensions, overlays)  
  may affect camera movement.
